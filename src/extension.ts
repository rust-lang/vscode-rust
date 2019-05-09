import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  NotificationType,
  ServerOptions,
} from 'vscode-languageclient';

import { RLSConfiguration } from './configuration';
import { SignatureHelpProvider } from './providers/signatureHelpProvider';
import { Decorator } from './providers/typeAnnotationsProvider';
import { checkForRls, ensureToolchain, rustupUpdate } from './rustup';
import { startSpinner, stopSpinner } from './spinner';
import { activateTaskProvider, Execution, runRlsCommand } from './tasks';
import { withWsl } from './utils/child_process';
import { uriWindowsToWsl, uriWslToWindows } from './utils/wslpath';

/**
 * Parameter type to `window/progress` request as issued by the RLS.
 * https://github.com/rust-lang/rls/blob/17a439440e6b00b1f014a49c6cf47752ecae5bb7/rls/src/lsp_data.rs#L395-L419
 */
interface ProgressParams {
  id: string;
  title?: string;
  message?: string;
  percentage?: number;
  done?: boolean;
}

export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(configureLanguage());

  vscode.workspace.onDidOpenTextDocument(doc =>
    didOpenTextDocument(doc, context),
  );
  vscode.workspace.textDocuments.forEach(doc =>
    didOpenTextDocument(doc, context),
  );
  vscode.workspace.onDidChangeWorkspaceFolders(e =>
    didChangeWorkspaceFolders(e, context),
  );
  vscode.window.onDidChangeVisibleTextEditors(editors => {
    const decorator = Decorator.getInstance()!;
    for (const editor of editors) {
      decorator.decorate(editor);
    }
  });
  vscode.window.onDidChangeActiveTextEditor(editor => {
    Decorator.getInstance()!.decorate(editor!);
  });
}

export async function deactivate() {
  return Promise.all([...workspaces.values()].map(ws => ws.stop()));
}

// Taken from https://github.com/Microsoft/vscode-extension-samples/blob/master/lsp-multi-server-sample/client/src/extension.ts
function didOpenTextDocument(
  document: vscode.TextDocument,
  context: vscode.ExtensionContext,
) {
  if (document.languageId !== 'rust' && document.languageId !== 'toml') {
    return;
  }

  const uri = document.uri;
  let folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return;
  }
  if (
    vscode.workspace
      .getConfiguration()
      .get<boolean>('rust-client.nestedMultiRootConfigInOutermost', true)
  ) {
    folder = getOuterMostWorkspaceFolder(folder);
  }
  // folder = getCargoTomlWorkspace(folder, document.uri.fsPath);
  if (!folder) {
    stopSpinner(`RLS: Cargo.toml missing`);
    return;
  }

  if (!workspaces.has(folder.uri)) {
    const workspace = new ClientWorkspace(folder);
    workspaces.set(folder.uri, workspace);
    workspace.start(context);
  }
}

// This is an intermediate, lazy cache used by `getOuterMostWorkspaceFolder`
// and cleared when VSCode workspaces change.
let _sortedWorkspaceFolders: string[] | undefined;

function sortedWorkspaceFolders(): string[] {
  if (!_sortedWorkspaceFolders && vscode.workspace.workspaceFolders) {
    _sortedWorkspaceFolders = vscode.workspace.workspaceFolders
      .map(folder => {
        let result = folder.uri.toString();
        if (result.charAt(result.length - 1) !== '/') {
          result = result + '/';
        }
        return result;
      })
      .sort((a, b) => {
        return a.length - b.length;
      });
  }
  return _sortedWorkspaceFolders || [];
}

// function getCargoTomlWorkspace(cur_workspace: WorkspaceFolder, file_path: string): WorkspaceFolder {
//     if (!cur_workspace) {
//         return cur_workspace;
//     }

//     const workspace_root = path.parse(cur_workspace.uri.fsPath).dir;
//     const root_manifest = path.join(workspace_root, 'Cargo.toml');
//     if (fs.existsSync(root_manifest)) {
//         return cur_workspace;
//     }

//     let current = file_path;

//     while (true) {
//         const old = current;
//         current = path.dirname(current);
//         if (old == current) {
//             break;
//         }
//         if (workspace_root == path.parse(current).dir) {
//             break;
//         }

//         const cargo_path = path.join(current, 'Cargo.toml');
//         if (fs.existsSync(cargo_path)) {
//             return { ...cur_workspace, uri: Uri.parse(current) };
//         }
//     }

//     return cur_workspace;
// }

function getOuterMostWorkspaceFolder(
  folder: vscode.WorkspaceFolder,
): vscode.WorkspaceFolder {
  const sorted = sortedWorkspaceFolders();
  for (const element of sorted) {
    let uri = folder.uri.toString();
    if (uri.charAt(uri.length - 1) !== '/') {
      uri = uri + '/';
    }
    if (uri.startsWith(element)) {
      return (
        vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(element)) || folder
      );
    }
  }
  return folder;
}

function didChangeWorkspaceFolders(
  e: vscode.WorkspaceFoldersChangeEvent,
  context: vscode.ExtensionContext,
) {
  _sortedWorkspaceFolders = undefined;

  // If a VSCode workspace has been added, check to see if it is part of an existing one, and
  // if not, and it is a Rust project (i.e., has a Cargo.toml), then create a new client.
  for (let folder of e.added) {
    folder = getOuterMostWorkspaceFolder(folder);
    if (workspaces.has(folder.uri)) {
      continue;
    }
    for (const f of fs.readdirSync(folder.uri.fsPath)) {
      if (f === 'Cargo.toml') {
        const workspace = new ClientWorkspace(folder);
        workspaces.set(folder.uri, workspace);
        workspace.start(context);
        break;
      }
    }
  }

  // If a workspace is removed which is a Rust workspace, kill the client.
  for (const folder of e.removed) {
    const ws = workspaces.get(folder.uri);
    if (ws) {
      workspaces.delete(folder.uri);
      ws.stop();
    }
  }
}

const workspaces: Map<vscode.Uri, ClientWorkspace> = new Map();

// We run one RLS and one corresponding language client per workspace folder
// (VSCode workspace, not Cargo workspace). This class contains all the per-client
// and per-workspace stuff.
class ClientWorkspace {
  // FIXME(#233): Don't only rely on lazily initializing it once on startup,
  // handle possible `rust-client.*` value changes while extension is running
  private readonly config: RLSConfiguration;
  private lc: LanguageClient | null = null;
  private readonly folder: vscode.WorkspaceFolder;
  private disposables: vscode.Disposable[];
  private decorator: Decorator | null = null;

  constructor(folder: vscode.WorkspaceFolder) {
    this.config = RLSConfiguration.loadFromWorkspace(folder.uri.fsPath);
    this.folder = folder;
    this.disposables = [];
  }

  public async start(context: vscode.ExtensionContext) {
    warnOnMissingCargoToml();

    startSpinner('RLS', 'Starting');

    const serverOptions: ServerOptions = async () => {
      await this.autoUpdate();
      return this.makeRlsProcess();
    };
    const clientOptions: LanguageClientOptions = {
      // Register the server for Rust files
      documentSelector: [
        { language: 'rust', scheme: 'file' },
        { language: 'rust', scheme: 'untitled' },
      ],
      diagnosticCollectionName: 'rust',
      synchronize: { configurationSection: 'rust' },
      // Controls when to focus the channel rather than when to reveal it in the drop-down list
      revealOutputChannelOn: this.config.revealOutputChannelOn,
      initializationOptions: {
        omitInitBuild: true,
        cmdRun: true,
      },
      workspaceFolder: this.folder,
    };

    // Changes paths between Windows and Windows Subsystem for Linux
    if (this.config.useWSL) {
      clientOptions.uriConverters = {
        code2Protocol: (uri: vscode.Uri) => {
          const res = vscode.Uri.file(uriWindowsToWsl(uri.fsPath)).toString();
          console.log(`code2Protocol for path ${uri.fsPath} -> ${res}`);
          return res;
        },
        protocol2Code: (wslUri: string) => {
          const urlDecodedPath = vscode.Uri.parse(wslUri).path;
          const winPath = vscode.Uri.file(uriWslToWindows(urlDecodedPath));
          console.log(`protocol2Code for path ${wslUri} -> ${winPath.fsPath}`);
          return winPath;
        },
      };
    }

    // Create the language client and start the client.
    this.lc = new LanguageClient(
      'rust-client',
      'Rust Language Server',
      serverOptions,
      clientOptions,
    );

    this.decorator = new Decorator(this.lc);

    this.setupProgressCounter();
    this.registerCommands(context);
    this.disposables.push(activateTaskProvider(this.folder));
    this.disposables.push(this.lc.start());
    this.disposables.push(
      vscode.languages.registerSignatureHelpProvider(
        { language: 'rust' },
        new SignatureHelpProvider(this.lc),
        '(',
        ',',
      ),
    );
  }

  public async stop() {
    if (this.lc) {
      await this.lc.stop();
    }

    this.disposables.forEach(d => d.dispose());
  }

  private registerCommands(context: vscode.ExtensionContext) {
    if (!this.lc) {
      return;
    }

    const rustupUpdateDisposable = vscode.commands.registerCommand(
      'rls.update',
      () => {
        return rustupUpdate(this.config.rustupConfig());
      },
    );
    this.disposables.push(rustupUpdateDisposable);

    const restartServer = vscode.commands.registerCommand(
      'rls.restart',
      async () => {
        await this.stop();
        return this.start(context);
      },
    );
    this.disposables.push(restartServer);

    this.disposables.push(
      vscode.commands.registerCommand('rls.run', (cmd: Execution) =>
        runRlsCommand(this.folder, cmd),
      ),
    );
  }

  private async setupProgressCounter() {
    if (!this.lc) {
      return;
    }

    const runningProgress: Set<string> = new Set();
    await this.lc.onReady();
    stopSpinner('RLS');
    this.lc.onNotification(
      new NotificationType<ProgressParams, void>('window/progress'),
      progress => {
        if (progress.done) {
          runningProgress.delete(progress.id);
          if (this.decorator) {
            for (const editor of vscode.window.visibleTextEditors) {
              this.decorator.decorate(editor);
            }
          }
        } else {
          runningProgress.add(progress.id);
        }
        if (runningProgress.size) {
          let status = '';
          if (typeof progress.percentage === 'number') {
            status = `${Math.round(progress.percentage * 100)}%`;
          } else if (progress.message) {
            status = progress.message;
          } else if (progress.title) {
            status = `[${progress.title.toLowerCase()}]`;
          }
          startSpinner('RLS', status);
        } else {
          stopSpinner('RLS');
        }
      },
    );
  }

  private async getSysroot(env: typeof process.env): Promise<string> {
    const wslWrapper = withWsl(this.config.useWSL);

    const rustcPrintSysroot = () =>
      this.config.rustupDisabled
        ? wslWrapper.execFile('rustc', ['--print', 'sysroot'], { env })
        : wslWrapper.execFile(
            this.config.rustupPath,
            ['run', this.config.channel, 'rustc', '--print', 'sysroot'],
            { env },
          );

    const { stdout } = await rustcPrintSysroot();
    return stdout
      .toString()
      .replace('\n', '')
      .replace('\r', '');
  }

  // Make an evironment to run the RLS.
  private async makeRlsEnv(
    args = {
      setLibPath: false,
    },
  ): Promise<typeof process.env> {
    // Shallow clone, we don't want to modify this process' $PATH or
    // $(DY)LD_LIBRARY_PATH
    const env = { ...process.env };

    let sysroot: string | undefined;
    try {
      sysroot = await this.getSysroot(env);
    } catch (err) {
      console.info(err.message);
      console.info(`Let's retry with extended $PATH`);
      env.PATH = `${env.HOME || '~'}/.cargo/bin:${env.PATH || ''}`;
      try {
        sysroot = await this.getSysroot(env);
      } catch (e) {
        console.warn('Error reading sysroot (second try)', e);
        vscode.window.showWarningMessage(`Error reading sysroot: ${e.message}`);
        return env;
      }
    }

    console.info(`Setting sysroot to`, sysroot);
    if (args.setLibPath) {
      function appendEnv(envVar: string, newComponent: string) {
        const old = process.env[envVar];
        return old ? `${newComponent}:${old}` : newComponent;
      }
      const newComponent = path.join(sysroot, 'lib');
      env.DYLD_LIBRARY_PATH = appendEnv('DYLD_LIBRARY_PATH', newComponent);
      env.LD_LIBRARY_PATH = appendEnv('LD_LIBRARY_PATH', newComponent);
    }

    return env;
  }

  private async makeRlsProcess(): Promise<child_process.ChildProcess> {
    // Run "rls" from the PATH unless there's an override.
    const rlsPath = this.config.rlsPath || 'rls';

    // We don't need to set [DY]LD_LIBRARY_PATH if we're using rustup,
    // as rustup will set it for us when it chooses a toolchain.
    // NOTE: Needs an installed toolchain when using rustup, hence we don't call
    // it immediately here.
    const makeRlsEnv = () =>
      this.makeRlsEnv({
        setLibPath: this.config.rustupDisabled,
      });
    const cwd = this.folder.uri.fsPath;

    let childProcess: child_process.ChildProcess;
    if (this.config.rustupDisabled) {
      console.info(`running without rustup: ${rlsPath}`);
      const env = await makeRlsEnv();

      childProcess = child_process.spawn(rlsPath, [], { env, cwd });
    } else {
      console.info(`running with rustup: ${rlsPath}`);
      const config = this.config.rustupConfig();

      await ensureToolchain(config);
      if (!this.config.rlsPath) {
        // We only need a rustup-installed RLS if we weren't given a
        // custom RLS path.
        console.info('will use a rustup-installed RLS; ensuring present');
        await checkForRls(config);
      }

      const env = await makeRlsEnv();
      childProcess = withWsl(config.useWSL).spawn(
        config.path,
        ['run', config.channel, rlsPath],
        { env, cwd },
      );
    }

    childProcess.on('error', (err: { code?: string; message: string }) => {
      if (err.code === 'ENOENT') {
        console.error(`Could not spawn RLS: ${err.message}`);
        vscode.window.showWarningMessage(
          `Could not spawn RLS: \`${err.message}\``,
        );
      }
    });

    if (this.config.logToFile) {
      const logPath = path.join(this.folder.uri.fsPath, `rls${Date.now()}.log`);
      const logStream = fs.createWriteStream(logPath, { flags: 'w+' });
      childProcess.stderr.pipe(logStream);
    }

    return childProcess;
  }

  private async autoUpdate() {
    if (this.config.updateOnStartup && !this.config.rustupDisabled) {
      await rustupUpdate(this.config.rustupConfig());
    }
  }
}

async function warnOnMissingCargoToml() {
  const files = await vscode.workspace.findFiles('Cargo.toml');

  if (files.length < 1) {
    vscode.window.showWarningMessage(
      'A Cargo.toml file must be at the root of the workspace in order to support all features',
    );
  }
}

/**
 * Sets up additional language configuration that's impossible to do via a
 * separate language-configuration.json file. See [1] for more information.
 *
 * [1]: https://github.com/Microsoft/vscode/issues/11514#issuecomment-244707076
 */
function configureLanguage(): vscode.Disposable {
  return vscode.languages.setLanguageConfiguration('rust', {
    onEnterRules: [
      {
        // Doc single-line comment
        // e.g. ///|
        beforeText: /^\s*\/{3}.*$/,
        action: { indentAction: vscode.IndentAction.None, appendText: '/// ' },
      },
      {
        // Parent doc single-line comment
        // e.g. //!|
        beforeText: /^\s*\/{2}\!.*$/,
        action: { indentAction: vscode.IndentAction.None, appendText: '//! ' },
      },
      {
        // Begins an auto-closed multi-line comment (standard or parent doc)
        // e.g. /** | */ or /*! | */
        beforeText: /^\s*\/\*(\*|\!)(?!\/)([^\*]|\*(?!\/))*$/,
        afterText: /^\s*\*\/$/,
        action: {
          indentAction: vscode.IndentAction.IndentOutdent,
          appendText: ' * ',
        },
      },
      {
        // Begins a multi-line comment (standard or parent doc)
        // e.g. /** ...| or /*! ...|
        beforeText: /^\s*\/\*(\*|\!)(?!\/)([^\*]|\*(?!\/))*$/,
        action: { indentAction: vscode.IndentAction.None, appendText: ' * ' },
      },
      {
        // Continues a multi-line comment
        // e.g.  * ...|
        beforeText: /^(\ \ )*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
        action: { indentAction: vscode.IndentAction.None, appendText: '* ' },
      },
      {
        // Dedents after closing a multi-line comment
        // e.g.  */|
        beforeText: /^(\ \ )*\ \*\/\s*$/,
        action: { indentAction: vscode.IndentAction.None, removeText: 1 },
      },
    ],
  });
}
