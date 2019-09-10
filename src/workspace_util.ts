import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceFolder, Uri } from 'vscode';



// searches up the folder structure until it finds a Cargo.toml
export function nearestParentWorkspace(
    curWorkspace: WorkspaceFolder,
    filePath: string,
  ): WorkspaceFolder {

    const workspaceRoot = path.parse(curWorkspace.uri.fsPath).dir;
    const rootManifest = path.join(workspaceRoot, 'Cargo.toml');
    if (fs.existsSync(rootManifest)) {
      return curWorkspace;
    }

    let current = filePath;

    while (true) {
      const old = current;
      current = path.dirname(current);
      if (old === current) {
        break;
      }
      if (workspaceRoot === path.parse(current).dir) {
        break;
      }

      const cargoPath = path.join(current, 'Cargo.toml');
      if (fs.existsSync(cargoPath)) {
        return { ...curWorkspace, uri: Uri.parse(current) };
      }
    }

    return curWorkspace;
  }


