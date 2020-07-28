import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import * as vs from 'vscode';
import * as lc from 'vscode-languageclient';

import { WorkspaceProgress } from './extension';
import { download, fetchRelease } from './net';
import * as rustup from './rustup';
import { Observable } from './utils/observable';

const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

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

/** Returns a path where persistent data for rust-analyzer should be installed. */
function metadataDir(): string | undefined {
  if (process.platform === 'linux' || process.platform === 'darwin') {
    // Prefer, in this order:
    // 1. $XDG_CONFIG_HOME/rust-analyzer
    // 2. $HOME/.config/rust-analyzer
    const { HOME, XDG_CONFIG_HOME } = process.env;
    const baseDir = XDG_CONFIG_HOME || (HOME && path.join(HOME, '.config'));

    return baseDir && path.resolve(path.join(baseDir, 'rust-analyzer'));
  } else if (process.platform === 'win32') {
    // %LocalAppData%\rust-analyzer\
    const { LocalAppData } = process.env;
    return (
      LocalAppData && path.resolve(path.join(LocalAppData, 'rust-analyzer'))
    );
  }

  return undefined;
}

function ensureDir(path: string) {
  return !!path && stat(path).catch(() => mkdir(path, { recursive: true }));
}

interface RustAnalyzerConfig {
  askBeforeDownload?: boolean;
  package: {
    releaseTag: string;
  };
}

interface Metadata {
  releaseTag: string;
}

async function readMetadata(): Promise<Metadata | {}> {
  const stateDir = metadataDir();
  if (!stateDir) {
    return { kind: 'error', code: 'NotSupported' };
  }

  const filePath = path.join(stateDir, 'metadata.json');
  if (!(await stat(filePath).catch(() => false))) {
    return { kind: 'error', code: 'FileMissing' };
  }

  const contents = await readFile(filePath, 'utf8');
  const obj = JSON.parse(contents);
  return typeof obj === 'object' ? obj : {};
}

async function writeMetadata(config: Metadata) {
  const stateDir = metadataDir();
  if (!stateDir) {
    return false;
  }

  if (!(await ensureDir(stateDir))) {
    return false;
  }

  const filePath = path.join(stateDir, 'metadata.json');
  return writeFile(filePath, JSON.stringify(config)).then(() => true);
}

export async function getServer({
  askBeforeDownload,
  package: pkg,
}: RustAnalyzerConfig): Promise<string | undefined> {
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
    return undefined;
  }

  const dir = installDir();
  if (!dir) {
    return;
  }
  await ensureDir(dir);

  const metadata: Partial<Metadata> = await readMetadata().catch(() => ({}));

  const dest = path.join(dir, binaryName);
  const exists = await stat(dest).catch(() => false);
  if (exists && metadata.releaseTag === pkg.releaseTag) {
    return dest;
  }

  if (askBeforeDownload) {
    const userResponse = await vs.window.showInformationMessage(
      `${
        metadata.releaseTag && metadata.releaseTag !== pkg.releaseTag
          ? `You seem to have installed release \`${metadata.releaseTag}\` but requested a different one.`
          : ''
      }
      Release \`${pkg.releaseTag}\` of rust-analyzer is not installed.\n
      Install to ${dir}?`,
      'Download',
    );
    if (userResponse !== 'Download') {
      return dest;
    }
  }

  const release = await fetchRelease(
    'rust-analyzer',
    'rust-analyzer',
    pkg.releaseTag,
  );
  const artifact = release.assets.find(asset => asset.name === binaryName);
  if (!artifact) {
    throw new Error(`Bad release: ${JSON.stringify(release)}`);
  }

  await download(
    artifact.browser_download_url,
    dest,
    'Downloading rust-analyzer server',
    { mode: 0o755 },
  );

  await writeMetadata({ releaseTag: pkg.releaseTag }).catch(() => {
    vs.window.showWarningMessage(`Couldn't save rust-analyzer metadata`);
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
): Promise<lc.LanguageClient> {
  if (!config.rustup.disabled) {
    await rustup.ensureToolchain(config.rustup);
    await rustup.ensureComponents(config.rustup, REQUIRED_COMPONENTS);
  }

  if (!config.rustAnalyzer.path) {
    await getServer({
      askBeforeDownload: true,
      package: { releaseTag: config.rustAnalyzer.releaseTag },
    });
  }

  if (INSTANCE) {
    return INSTANCE;
  }

  const serverOptions: lc.ServerOptions = async () => {
    const binPath =
      config.rustAnalyzer.path ||
      (await getServer({
        package: { releaseTag: config.rustAnalyzer.releaseTag },
      }));

    if (!binPath) {
      throw new Error("Couldn't fetch Rust Analyzer binary");
    }

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

      const RUST_ANALYZER_PROGRESS = 'rustAnalyzer/startup';
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
