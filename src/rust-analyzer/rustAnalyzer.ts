import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import * as vs from 'vscode';
import * as lc from 'vscode-languageclient';

import { WorkspaceProgress } from '../extension';
import { download, fetchRelease } from '../net';
import * as rustup from '../rustup';
import { Observable } from '../utils/observable';
import { PersistentState } from './persistent_state';

const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);

const REQUIRED_COMPONENTS = ['rust-src'];

/** Returns a path where rust-analyzer should be installed. */
function installDir(): string | undefined {
  if (process.platform === 'linux' || process.platform === 'darwin') {
    // Prefer, in this order:
    // 1. $XDG_BIN_HOME (proposed addition to XDG spec)
    // 2. $XDG_DATA_HOME/../bin/
    // 3. $HOME/.local/bin/
    const { HOME, XDG_DATA_HOME, XDG_BIN_HOME } = process.env;
    if (XDG_BIN_HOME) {
      return path.resolve(XDG_BIN_HOME);
    }

    const baseDir = XDG_DATA_HOME
      ? path.join(XDG_DATA_HOME, '..')
      : HOME && path.join(HOME, '.local');
    return baseDir && path.resolve(path.join(baseDir, 'bin'));
  } else if (process.platform === 'win32') {
    // %LocalAppData%\rust-analyzer\
    const { LocalAppData } = process.env;
    return (
      LocalAppData && path.resolve(path.join(LocalAppData, 'rust-analyzer'))
    );
  }

  return undefined;
}

interface RustAnalyzerConfig {
  askBeforeDownload?: boolean;
  package: {
    releaseTag: string;
  };
}

export async function getServer(
  config: RustAnalyzerConfig,
  state: PersistentState,
): Promise<string | undefined> {
  let binaryName: string | undefined;
  if (process.arch === 'x64' || process.arch === 'ia32') {
    if (process.platform === 'linux') {
      binaryName = 'rust-analyzer-linux';
    }
    if (process.platform === 'darwin') {
      binaryName = 'rust-analyzer-mac';
    }
    if (process.platform === 'win32') {
      binaryName = 'rust-analyzer-windows.exe';
    }
  }
  if (binaryName === undefined) {
    vs.window.showErrorMessage(
      "Unfortunately we don't ship binaries for your platform yet. " +
        'You need to manually clone rust-analyzer repository and ' +
        'run `cargo xtask install --server` to build the language server from sources. ' +
        'If you feel that your platform should be supported, please create an issue ' +
        'about that [here](https://github.com/rust-analyzer/rust-analyzer/issues) and we ' +
        'will consider it.',
    );
    return;
  }

  const dir = installDir();
  if (!dir) {
    return;
  } else {
    await stat(dir).catch(() => mkdir(dir, { recursive: true }));
  }

  const dest = path.join(dir, binaryName);
  const exists = await stat(dest).catch(() => false);

  if (!exists) {
    await state.updateInstalledRelease(undefined);
  }

  const now = Date.now();
  if (state.installedRelease?.tag === config.package.releaseTag) {
    // Release tags that are *moving* - these are expected to point to different
    // commits and update as the time goes on. Make sure to poll the GitHub API
    // (at most once per hour) to see if we need to update.
    const MOVING_TAGS = ['nightly'];
    const POLL_INTERVAL = 60 * 60 * 1000;

    const shouldCheckForNewRelease = MOVING_TAGS.includes(
      config.package.releaseTag,
    )
      ? state.installedRelease === undefined ||
        now - (state.lastCheck ?? 0) > POLL_INTERVAL
      : false;

    if (!shouldCheckForNewRelease) {
      return dest;
    }
  }

  const release = await fetchRelease(
    'rust-analyzer',
    'rust-analyzer',
    config.package.releaseTag,
  );

  if (state.installedRelease?.id === release.id) {
    return dest;
  }

  const artifact = release.assets.find(asset => asset.name === binaryName);
  if (!artifact) {
    throw new Error(`Bad release: ${JSON.stringify(release)}`);
  }

  if (config.askBeforeDownload) {
    const userResponse = await vs.window.showInformationMessage(
      `${
        state.installedRelease &&
        state.installedRelease.tag !== config.package.releaseTag
          ? `You seem to have installed release \`${state.installedRelease?.tag}\` but requested a different one.`
          : ''
      }
      Release \`${config.package.releaseTag}\` of rust-analyzer ${
        !state.installedRelease ? 'is not installed' : 'can be updated'
      }.\n
      Install to ${dir}?`,
      'Download',
    );
    if (userResponse !== 'Download') {
      return exists ? dest : undefined;
    }
  }

  await download({
    url: artifact.browser_download_url,
    dest,
    progressTitle: 'Downloading rust-analyzer server',
    mode: 0o755,
  });

  await state.updateLastCheck(now);
  await state.updateInstalledRelease({
    id: release.id,
    tag: config.package.releaseTag,
  });

  return dest;
}

/**
 * Rust Analyzer does not work in an isolated environment and greedily analyzes
 * the workspaces itself, so make sure to spawn only a single instance.
 */
let INSTANCE: lc.LanguageClient | undefined;

/**
 * TODO:
 * Global observable progress
 */
const PROGRESS: Observable<WorkspaceProgress> = new Observable<
  WorkspaceProgress
>({ state: 'standby' });

export async function createLanguageClient(
  folder: vs.WorkspaceFolder,
  config: {
    revealOutputChannelOn?: lc.RevealOutputChannelOn;
    logToFile?: boolean;
    rustup: { disabled: boolean; path: string; channel: string };
    rustAnalyzer: { path?: string; releaseTag: string };
  },
  state: vs.Memento,
): Promise<lc.LanguageClient> {
  if (!config.rustup.disabled) {
    await rustup.ensureToolchain(config.rustup);
    await rustup.ensureComponents(config.rustup, REQUIRED_COMPONENTS);
  }

  const binPath =
    config.rustAnalyzer.path ||
    (await getServer(
      {
        askBeforeDownload: true,
        package: { releaseTag: config.rustAnalyzer.releaseTag },
      },
      new PersistentState(state),
    ));

  if (!binPath) {
    throw new Error("Couldn't fetch Rust Analyzer binary");
  }

  if (INSTANCE) {
    return INSTANCE;
  }

  const serverOptions: lc.ServerOptions = async () => {
    const childProcess = child_process.exec(binPath);
    if (config.logToFile) {
      const logPath = path.join(folder.uri.fsPath, `ra-${Date.now()}.log`);
      const logStream = fs.createWriteStream(logPath, { flags: 'w+' });
      childProcess.stderr?.pipe(logStream);
    }

    return childProcess;
  };

  const clientOptions: lc.LanguageClientOptions = {
    // Register the server for Rust files
    documentSelector: [
      { language: 'rust', scheme: 'file' },
      { language: 'rust', scheme: 'untitled' },
    ],
    diagnosticCollectionName: `rust`,
    // synchronize: { configurationSection: 'rust' },
    // Controls when to focus the channel rather than when to reveal it in the drop-down list
    revealOutputChannelOn: config.revealOutputChannelOn,
    // TODO: Support and type out supported settings by the rust-analyzer
    initializationOptions: vs.workspace.getConfiguration('rust.rust-analyzer'),
  };

  INSTANCE = new lc.LanguageClient(
    'rust-client',
    'Rust Analyzer',
    serverOptions,
    clientOptions,
  );

  // Enable semantic highlighting which is available in stable VSCode
  INSTANCE.registerProposedFeatures();
  // We can install only one progress handler so make sure to do that when
  // setting up the singleton instance
  setupGlobalProgress(INSTANCE);

  return INSTANCE;
}

async function setupGlobalProgress(client: lc.LanguageClient) {
  client.onDidChangeState(async ({ newState }) => {
    if (newState === lc.State.Starting) {
      await client.onReady();

      const RUST_ANALYZER_PROGRESS = 'rustAnalyzer/roots scanned';
      client.onProgress(
        new lc.ProgressType<{
          kind: 'begin' | 'report' | 'end';
          message?: string;
        }>(),
        RUST_ANALYZER_PROGRESS,
        ({ kind, message: msg }) => {
          if (kind === 'report') {
            PROGRESS.value = { state: 'progress', message: msg || '' };
          }
          if (kind === 'end') {
            PROGRESS.value = { state: 'ready' };
          }
        },
      );
    }
  });
}

export function setupClient(
  _client: lc.LanguageClient,
  _folder: vs.WorkspaceFolder,
): vs.Disposable[] {
  return [];
}

export function setupProgress(
  _client: lc.LanguageClient,
  workspaceProgress: Observable<WorkspaceProgress>,
) {
  workspaceProgress.value = PROGRESS.value;
  // We can only ever install one progress handler per language client and since
  // we can only ever have one instance of Rust Analyzer, fake the global
  // progress as a workspace one.
  PROGRESS.observe(progress => {
    workspaceProgress.value = progress;
  });
}
