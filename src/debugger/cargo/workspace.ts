import { Uri } from 'vscode';
import { isDescendant } from '../util';
import Package from './package';

export default class CargoWorkspace {
  constructor(
    readonly wsRoot: string | undefined,
    readonly targetDir: string,
    readonly members: Package[],
    readonly packages: Package[],
  ) {
    if (members === undefined) {
      throw new Error('Assertion failed: CargoWorkspace.members !== undefined');
    }
  }

  public getManifestDir(uri: Uri): string | undefined {
    let candidate: string = '';

    for (const m of this.members) {
      if (candidate.length >= m.manifest_dir.length) {
        continue;
      }

      const dir = m.manifest_dir;
      if (!isDescendant(dir, uri.fsPath)) {
        continue;
      }

      candidate = m.manifest_dir;
    }

    //
    if (candidate.length === 0) {
      return;
    }

    return candidate;
  }
}

