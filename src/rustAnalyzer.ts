import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { download, fetchRelease } from './net';

const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);

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

async function ensureInstallDir() {
  const dir = installDir();
  if (!dir) {
    return;
  }
  const exists = await stat(dir).then(
    () => true,
    () => false,
  );
  if (!exists) {
    await mkdir(dir);
  }
}

interface RustAnalyzerConfig {
  askBeforeDownload: boolean;
  package: {
    releaseTag: string;
  };
}

export async function getServer(
  config: RustAnalyzerConfig,
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
    vscode.window.showErrorMessage(
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
  await ensureInstallDir();
  const dest = path.join(dir, binaryName);
  const exists = await stat(dest).then(
    () => true,
    () => false,
  );
  if (exists) {
    return dest;
  }

  if (config.askBeforeDownload) {
    const userResponse = await vscode.window.showInformationMessage(
      `Language server release ${config.package.releaseTag} for rust-analyzer is not installed.\n
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
    config.package.releaseTag,
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

  return dest;
}
