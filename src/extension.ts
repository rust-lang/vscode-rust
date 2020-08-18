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
  Memento,
} from 'vscode';
import * as lc from 'vscode-languageclient';

import { RLSConfiguration } from './configuration';
import * as rls from './rls';
import * as rustAnalyzer from './rust-analyzer';
import { rustupUpdate } from './rustup';
import { startSpinner, stopSpinner } from './spinner';
import { activateTaskProvider, Execution, runRlsCommand } from './tasks';
import { Observable } from './utils/observable';
import { nearestParentWorkspace } from './utils/workspace';

/**
 * External API as exposed by the extension. Can be queried by other extensions
 * or by the integration test runner for VSCode extensions.
 */
export interface Api {
  activeWorkspace: typeof activeWorkspace;
}

export async function activate(context: ExtensionContext): Promise<Api> {
  // Weave in global state when handling changed active text editor
  const handleChangedActiveTextEd = (ed: TextEditor | undefined) =>
    onDidChangeActiveTextEditor(ed, context.globalState);

  context.subscriptions.push(
    ...[
      configureLanguage(),
      ...registerCommands(),
      workspace.onDidChangeWorkspaceFolders(whenChangingWorkspaceFolders),
      window.onDidChangeActiveTextEditor(handleChangedActiveTextEd),
    ],
  );
  // Manually trigger the first event to start up server instance if necessary,
  // since VSCode doesn't do that on startup by itself.
  handleChangedActiveTextEd(window.activeTextEditor);

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

  return { activeWorkspace };
}

export async function deactivate() {
  return Promise.all([...workspaces.values()].map(ws => ws.stop()));
}

/** Tracks dynamically updated progress for the active client workspace for UI purposes. */
let progressObserver: Disposable | undefined;

function onDidChangeActiveTextEditor(
  editor: TextEditor | undefined,
  globalState: Memento,
) {
  if (!editor || !editor.document) {
    return;
  }
  const { languageId, uri } = editor.document;

  const workspace = clientWorkspaceForUri(uri, globalState, {
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const workspaces: Map<string, ClientWorkspace> = new Map();

/**
 * Fetches a `ClientWorkspace` for a given URI. If missing and `initializeIfMissing`
 * option was provided, it is additionally initialized beforehand, if applicable.
 */
function clientWorkspaceForUri(
  uri: Uri,
  globalState: Memento,
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
    const workspace = new ClientWorkspace(folder, globalState);
    workspaces.set(folder.uri.toString(), workspace);
    workspace.autoStart();
  }

  return workspaces.get(folder.uri.toString());
}

/** Denotes the state or progress the workspace is currently in. */
export type WorkspaceProgress =
  | { state: 'progress'; message: string }
  | { state: 'ready' | 'standby' };

// We run a single server/client pair per workspace folder (VSCode workspace,
// not Cargo workspace). This class contains all the per-client and
// per-workspace stuff.
export class ClientWorkspace {
  public readonly folder: WorkspaceFolder;
  // FIXME(#233): Don't only rely on lazily initializing it once on startup,
  // handle possible `rust-client.*` value changes while extension is running
  private readonly config: RLSConfiguration;
  private lc: lc.LanguageClient | null = null;
  private disposables: Disposable[];
  private _progress: Observable<WorkspaceProgress>;
  private globalState: Memento;
  get progress() {
    return this._progress;
  }

  constructor(folder: WorkspaceFolder, globalState: Memento) {
    this.config = RLSConfiguration.loadFromWorkspace(folder.uri.fsPath);
    this.folder = folder;
    this.disposables = [];
    this._progress = new Observable<WorkspaceProgress>({ state: 'standby' });
    this.globalState = globalState;
  }

  /**
   * Attempts to start a server instance, if not configured otherwise via
   * applicable `rust-client.autoStartRls` setting.
   *
   * @returns whether the server has started.
   */
  public async autoStart() {
    return this.config.autoStartRls && this.start().then(() => true);
  }

  public async start() {
    const { createLanguageClient, setupClient, setupProgress } =
      this.config.engine === 'rls' ? rls : rustAnalyzer;

    const client = await createLanguageClient(
      this.folder,
      {
        updateOnStartup: this.config.updateOnStartup,
        revealOutputChannelOn: this.config.revealOutputChannelOn,
        logToFile: this.config.logToFile,
        rustup: {
          channel: this.config.channel,
          path: this.config.rustupPath,
          disabled: this.config.rustupDisabled,
        },
        rls: { path: this.config.rlsPath },
        rustAnalyzer: this.config.rustAnalyzer,
      },
      this.globalState,
    );

    client.onDidChangeState(({ newState }) => {
      if (newState === lc.State.Starting) {
        this._progress.value = { state: 'progress', message: 'Starting' };
      }
      if (newState === lc.State.Stopped) {
        this._progress.value = { state: 'standby' };
      }
    });

    setupProgress(client, this._progress);

    this.disposables.push(activateTaskProvider(this.folder));
    this.disposables.push(...setupClient(client, this.folder));
    if (client.needsStart()) {
      this.disposables.push(client.start());
    }
  }

  public async stop() {
    if (this.lc) {
      await this.lc.stop();
    }

    this.disposables.forEach(d => void d.dispose());
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
    commands.registerCommand('rls.update', () =>
      activeWorkspace.value?.rustupUpdate(),
    ),
    commands.registerCommand('rls.restart', async () =>
      activeWorkspace.value?.restart(),
    ),
    commands.registerCommand('rls.run', (cmd: Execution) =>
      activeWorkspace.value?.runRlsCommand(cmd),
    ),
    commands.registerCommand('rls.start', () => activeWorkspace.value?.start()),
    commands.registerCommand('rls.stop', () => activeWorkspace.value?.stop()),
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
