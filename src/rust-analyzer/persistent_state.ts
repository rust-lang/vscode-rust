import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

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

export interface Metadata {
  releaseTag: string;
}

export async function readMetadata(): Promise<
  Metadata | Record<string, unknown>
> {
  const stateDir = metadataDir();
  if (!stateDir) {
    return { kind: 'error', code: 'NotSupported' };
  }

  const filePath = path.join(stateDir, 'metadata.json');
  if (!(await stat(filePath).catch(() => false))) {
    return { kind: 'error', code: 'FileMissing' };
  }

  const contents = await readFile(filePath, 'utf8');
  const obj = JSON.parse(contents) as unknown;
  return typeof obj === 'object' ? (obj as Record<string, unknown>) : {};
}

export async function writeMetadata(config: Metadata) {
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

function ensureDir(path: string) {
  return !!path && stat(path).catch(() => mkdir(path, { recursive: true }));
}
