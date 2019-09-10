import * as fs from 'fs';
import * as path from 'path';
import { Uri, WorkspaceFolder } from 'vscode';

// searches up the folder structure until it finds a Cargo.toml
export function nearestParentWorkspace(
  curWorkspace: WorkspaceFolder,
  filePath: string,
): WorkspaceFolder {
  // check that the workspace folder already contains the "Cargo.toml"
  const workspaceRoot = path.parse(curWorkspace.uri.fsPath).dir;
  const rootManifest = path.join(workspaceRoot, 'Cargo.toml');
  if (fs.existsSync(rootManifest)) {
    return curWorkspace;
  }

  // algorithm that will strip one folder at a time and check if that folder contains "Cargo.toml"
  let current = filePath;
  while (true) {
    const old = current;
    current = path.dirname(current);

    // break in case there is a bug that could result in a busy loop
    if (old === current) {
      break;
    }

    // break in case the strip folder has not changed
    if (workspaceRoot === path.parse(current).dir) {
      break;
    }

    // check if "Cargo.toml" is present in the parent folder
    const cargoPath = path.join(current, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      // ghetto change the uri on Workspace folder to make vscode think it's located elsewhere
      return { ...curWorkspace, uri: Uri.parse(current) };
    }
  }

  return curWorkspace;
}
