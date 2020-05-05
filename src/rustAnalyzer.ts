import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

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
  const exists = await stat(dir).then(() => true, () => false);
  if (!exists) {
    await mkdir(dir);
  }
}
