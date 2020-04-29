import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import {
  commands,
  ConfigurationTarget,
  Disposable,
  ExtensionContext,
  IndentAction,
  languages,
  TextEditor,
  Uri,
  window,
  workspace,
  WorkspaceFolder,
  WorkspaceFoldersChangeEvent,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  NotificationType,
  ServerOptions,
} from 'vscode-languageclient';

import { RLSConfiguration } from './configuration';
import { SignatureHelpProvider } from './providers/signatureHelpProvider';
import { checkForRls, ensureToolchain, rustupUpdate } from './rustup';
import { startSpinner, stopSpinner } from './spinner';
import { activateTaskProvider, Execution, runRlsCommand } from './tasks';
import { Observable } from './utils/observable';
import { nearestParentWorkspace } from './utils/workspace';

const exec = util.promisify(child_process.exec);

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

export async function activate(context: ExtensionContext) {
  context.subscriptions.push(
    ...[
      configureLanguage(),
      ...registerCommands(),
      workspace.onDidChangeWorkspaceFolders(whenChangingWorkspaceFolders),
      window.onDidChangeActiveTextEditor(onDidChangeActiveTextEditor),
    ],
  );
  // Manually trigger the first event to start up server instance if necessary,
  // since VSCode doesn't do that on startup by itself.
  onDidChangeActiveTextEditor(window.activeTextEditor);

  // Migrate the users of multi-project setup for RLS to disable the setting
  // entirely (it's always on now)
  const config = workspace.getConfiguration();
  if (
    typeof config.get<boolean | null>(
      'rust-client.enableMultiProjectSetup',
      null,
    ) === 'boolean'
  ) {
    window
      .showWarningMessage(
        'The multi-project setup for RLS is always enabled, so the `rust-client.enableMultiProjectSetup` setting is now redundant',
        { modal: false },
        { title: 'Remove' },
      )
      .then(value => {
        if (value && value.title === 'Remove') {
          return config.update(
            'rust-client.enableMultiProjectSetup',
            null,
            ConfigurationTarget.Global,
          );
        }
        return;
      });
  }
}

export async function deactivate() {
  return Promise.all([...workspaces.values()].map(ws => ws.stop()));
}

/** Tracks dynamically updated progress for the active client workspace for UI purposes. */
let progressObserver: Disposable | undefined;

function onDidChangeActiveTextEditor(editor: TextEditor | undefined) {
  if (!editor || !editor.document) {
    return;
  }
  const { languageId, uri } = editor.document;

  const workspace = clientWorkspaceForUri(uri, {
    initializeIfMissing: languageId === 'rust' || languageId === 'toml',
  });
  if (!workspace) {
    return;
  }

  activeWorkspace.value = workspace;

  const updateProgress = (progress: WorkspaceProgress) => {
    if (progress.state === 'progress') {
      startSpinner(`[${workspace.folder.name}] ${progress.message}`);
    } else {
      const readySymbol =
        progress.state === 'standby' ? '$(debug-stop)' : '$(debug-start)';
      stopSpinner(`[${workspace.folder.name}] ${readySymbol}`);
    }
  };

  if (progressObserver) {
    progressObserver.dispose();
  }
  progressObserver = workspace.progress.observe(updateProgress);
  // Update UI ourselves immediately and don't wait for value update callbacks
  updateProgress(workspace.progress.value);
}

function whenChangingWorkspaceFolders(e: WorkspaceFoldersChangeEvent) {
  // If a workspace is removed which is a Rust workspace, kill the client.
  for (const folder of e.removed) {
    const ws = workspaces.get(folder.uri.toString());
    if (ws) {
      workspaces.delete(folder.uri.toString());
      ws.stop();
    }
  }
}

// Don't use URI as it's unreliable the same path might not become the same URI.
const workspaces: Map<string, ClientWorkspace> = new Map();

/**
 * Fetches a `ClientWorkspace` for a given URI. If missing and `initializeIfMissing`
 * option was provided, it is additionally initialized beforehand, if applicable.
 */
function clientWorkspaceForUri(
  uri: Uri,
  options?: { initializeIfMissing: boolean },
): ClientWorkspace | undefined {
  const rootFolder = workspace.getWorkspaceFolder(uri);
  if (!rootFolder) {
    return;
  }

  const folder = nearestParentWorkspace(rootFolder, uri.fsPath);
  if (!folder) {
    return undefined;
  }

  const existing = workspaces.get(folder.uri.toString());
  if (!existing && options && options.initializeIfMissing) {
    const workspace = new ClientWorkspace(folder);
    workspaces.set(folder.uri.toString(), workspace);
    workspace.autoStart();
  }

  return workspaces.get(folder.uri.toString());
}

/** Denotes the state or progress the workspace is currently in. */
type WorkspaceProgress =
  | { state: 'progress'; message: string }
  | { state: 'ready' | 'standby' };

// We run one RLS and one corresponding language client per workspace folder
// (VSCode workspace, not Cargo workspace). This class contains all the per-client
// and per-workspace stuff.
export class ClientWorkspace {
  public readonly folder: WorkspaceFolder;
  // FIXME(#233): Don't only rely on lazily initializing it once on startup,
  // handle possible `rust-client.*` value changes while extension is running
  private readonly config: RLSConfiguration;
  private lc: LanguageClient | null = null;
  private disposables: Disposable[];
  private _progress: Observable<WorkspaceProgress>;
  get progress() {
    return this._progress;
  }

  constructor(folder: WorkspaceFolder) {
    this.config = RLSConfiguration.loadFromWorkspace(folder.uri.fsPath);
    this.folder = folder;
    this.disposables = [];
    this._progress = new Observable<WorkspaceProgress>({ state: 'standby' });
  }

  /**
   * Attempts to start a server instance, if not configured otherwise via
   * applicable `rust-client.autoStartRls` setting.
   * @returns whether the server has started.
   */
  public async autoStart() {
    return this.config.autoStartRls && this.start().then(() => true);
  }

  public async start() {
    this._progress.value = { state: 'progress', message: 'Starting' };

    const serverOptions: ServerOptions = async () => {
      await this.autoUpdate();
      return this.makeRlsProcess();
    };

    // This accepts `vscode.GlobPattern` under the hood, which requires only
    // forward slashes. It's worth mentioning that RelativePattern does *NOT*
    // work in remote scenarios (?), so rely on normalized fs path from VSCode URIs.
    const pattern = `${this.folder.uri.fsPath.replace(path.sep, '/')}/**`;

    const clientOptions: LanguageClientOptions = {
      // Register the server for Rust files
      documentSelector: [
        { language: 'rust', scheme: 'file', pattern },
        { language: 'rust', scheme: 'untitled', pattern },
      ],
      diagnosticCollectionName: `rust-${this.folder.uri}`,
      synchronize: { configurationSection: 'rust' },
      // Controls when to focus the channel rather than when to reveal it in the drop-down list
      revealOutputChannelOn: this.config.revealOutputChannelOn,
      initializationOptions: {
        omitInitBuild: true,
        cmdRun: true,
      },
      workspaceFolder: this.folder,
    };

    // Create the language client and start the client.
    this.lc = new LanguageClient(
      'rust-client',
      'Rust Language Server',
      serverOptions,
      clientOptions,
    );

    const selector = { language: 'rust', scheme: 'file', pattern };

    this.setupProgressCounter();
    this.disposables.push(activateTaskProvider(this.folder));
    this.disposables.push(this.lc.start());
    this.disposables.push(
      languages.registerSignatureHelpProvider(
        selector,
        new SignatureHelpProvider(this.lc),
        '(',
        ',',
      ),
    );
  }

  public async stop() {
    if (this.lc) {
      await this.lc.stop();
      this.lc = null;
      this._progress.value = { state: 'standby' };
    }

    this.disposables.forEach(d => d.dispose());
  }

  public async restart() {
    await this.stop();
    return this.start();
  }

  public runRlsCommand(cmd: Execution) {
    return runRlsCommand(this.folder, cmd);
  }

  public rustupUpdate() {
    return rustupUpdate(this.config.rustupConfig());
  }

  private async setupProgressCounter() {
    if (!this.lc) {
      return;
    }

    const runningProgress: Set<string> = new Set();
    await this.lc.onReady();

    this.lc.onNotification(
      new NotificationType<ProgressParams, void>('window/progress'),
      progress => {
        if (progress.done) {
          runningProgress.delete(progress.id);
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
          this._progress.value = { state: 'progress', message: status };
        } else {
          this._progress.value = { state: 'ready' };
        }
      },
    );
  }

  private async getSysroot(env: typeof process.env): Promise<string> {
    const rustcPrintSysroot = () =>
      this.config.rustupDisabled
        ? exec('rustc --print sysroot', { env })
        : exec(
            `${this.config.rustupPath} run ${this.config.channel} rustc --print sysroot`,
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
        window.showWarningMessage(`Error reading sysroot: ${e.message}`);
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

      childProcess = child_process.spawn(rlsPath, [], {
        env,
        cwd,
        shell: true,
      });
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
      childProcess = child_process.spawn(
        config.path,
        ['run', config.channel, rlsPath],
        { env, cwd, shell: true },
      );
    }

    childProcess.on('error', (err: { code?: string; message: string }) => {
      if (err.code === 'ENOENT') {
        console.error(`Could not spawn RLS: ${err.message}`);
        window.showWarningMessage(`Could not spawn RLS: \`${err.message}\``);
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

/**
 * Tracks the most current VSCode workspace as opened by the user. Used by the
 * commands to know in which workspace these should be executed.
 */
const activeWorkspace = new Observable<ClientWorkspace | null>(null);

/**
 * Registers the VSCode [commands] used by the extension.
 *
 * [commands]: https://code.visualstudio.com/api/extension-guides/command
 */
function registerCommands(): Disposable[] {
  return [
    commands.registerCommand(
      'rls.update',
      () => activeWorkspace.value && activeWorkspace.value.rustupUpdate(),
    ),
    commands.registerCommand(
      'rls.restart',
      async () => activeWorkspace.value && activeWorkspace.value.restart(),
    ),
    commands.registerCommand(
      'rls.run',
      (cmd: Execution) =>
        activeWorkspace.value && activeWorkspace.value.runRlsCommand(cmd),
    ),
    commands.registerCommand(
      'rls.start',
      () => activeWorkspace.value && activeWorkspace.value.start(),
    ),
    commands.registerCommand(
      'rls.stop',
      () => activeWorkspace.value && activeWorkspace.value.stop(),
    ),
  ];
}

/**
 * Sets up additional language configuration that's impossible to do via a
 * separate language-configuration.json file. See [1] for more information.
 *
 * [1]: https://github.com/Microsoft/vscode/issues/11514#issuecomment-244707076
 */
function configureLanguage(): Disposable {
  return languages.setLanguageConfiguration('rust', {
    onEnterRules: [
      {
        // Doc single-line comment
        // e.g. ///|
        beforeText: /^\s*\/{3}.*$/,
        action: { indentAction: IndentAction.None, appendText: '/// ' },
      },
      {
        // Parent doc single-line comment
        // e.g. //!|
        beforeText: /^\s*\/{2}\!.*$/,
        action: { indentAction: IndentAction.None, appendText: '//! ' },
      },
      {
        // Begins an auto-closed multi-line comment (standard or parent doc)
        // e.g. /** | */ or /*! | */
        beforeText: /^\s*\/\*(\*|\!)(?!\/)([^\*]|\*(?!\/))*$/,
        afterText: /^\s*\*\/$/,
        action: { indentAction: IndentAction.IndentOutdent, appendText: ' * ' },
      },
      {
        // Begins a multi-line comment (standard or parent doc)
        // e.g. /** ...| or /*! ...|
        beforeText: /^\s*\/\*(\*|\!)(?!\/)([^\*]|\*(?!\/))*$/,
        action: { indentAction: IndentAction.None, appendText: ' * ' },
      },
      {
        // Continues a multi-line comment
        // e.g.  * ...|
        beforeText: /^(\ \ )*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
        action: { indentAction: IndentAction.None, appendText: '* ' },
      },
      {
        // Dedents after closing a multi-line comment
        // e.g.  */|
        beforeText: /^(\ \ )*\ \*\/\s*$/,
        action: { indentAction: IndentAction.None, removeText: 1 },
      },
    ],
  });
}
