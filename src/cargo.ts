import * as child_process from 'child_process';
import * as util from 'util';
import * as vscode from 'vscode';
import { runTaskCommand } from './tasks';
import { startSpinner, stopSpinner } from './spinner';

const exec = util.promisify(child_process.exec);

interface Package {
  readonly name: string;
  readonly version: string;
}

export async function ensurePackage(name: string): Promise<boolean> {
  if (await isPackageInstalled(name)) {
    return true;
  }

  const ok = await Promise.resolve(
    vscode.window.showInformationMessage(
      `The package ${name} is required. Install it?`,
      'Yes',
    ),
  );

  if (!ok) {
    throw new Error(`Missing package ${name}`);
  }

  return await installPackage(name);
}

export async function isPackageInstalled(name: string): Promise<boolean> {
  const packages = await listInstalledPackages();
  return packages.some(p => p.name === name);
}

async function listInstalledPackages(): Promise<Package[]> {
  const { stdout } = await exec(`cargo install --list`, { encoding: 'utf8' });

  const result: Package[] = [];
  const regex = /^(?<name>\S+) v(?<version>[^:]+):$/gm;
  let match: RegExpMatchArray | null;

  while ((match = regex.exec(stdout)) && match.groups) {
    result.push({
      name: match.groups.name,
      version: match.groups.version,
    });
  }

  return result;
}

async function installPackage(name: string): Promise<boolean> {
  startSpinner(`Installing ${name}...`);

  try {
    const command = 'cargo';
    const args = ['install', name];
    await runTaskCommand({ command, args }, `Installing \`${name}\``);

    if (!(await isPackageInstalled(name))) {
      throw new Error(`Failed to detect package ${name}`);
    }

    stopSpinner(`Installed ${name}`);
    return true;
  } catch (e) {
    stopSpinner(`Could not install ${name}`);

    vscode.window.showErrorMessage(
      `Could not install package: ${name}${
        e.message ? `, message: ${e.message}` : ''
      }`,
    );

    throw e;
  }
}
