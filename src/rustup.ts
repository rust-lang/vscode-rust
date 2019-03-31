/**
 * @file This module handles running the RLS via rustup, including checking that
 * rustup is installed and installing any required components/toolchains.
 */
import { window } from 'vscode';

import { startSpinner, stopSpinner } from './spinner';
import { runTaskCommand } from './tasks';
import { withWsl } from './utils/child_process';

const REQUIRED_COMPONENTS = ['rust-analysis', 'rust-src', 'rls'];

function isInstalledRegex(componentName: string): RegExp {
  return new RegExp(`^(${componentName}.*) \\((default|installed)\\)$`);
}

export interface RustupConfig {
  channel: string;
  path: string;
  useWSL: boolean;
}

export async function rustupUpdate(config: RustupConfig) {
  startSpinner('RLS', 'Updating…');

  try {
    const { stdout } = await withWsl(config.useWSL).execFile(config.path, [
      'update',
    ]);

    // This test is imperfect because if the user has multiple toolchains installed, they
    // might have one updated and one unchanged. But I don't want to go too far down the
    // rabbit hole of parsing rustup's output.
    if (stdout.includes('unchanged')) {
      stopSpinner('Up to date.');
    } else {
      stopSpinner('Up to date. Restart extension for changes to take effect.');
    }
  } catch (e) {
    console.log(e);
    stopSpinner('An error occurred whilst trying to update.');
  }
}

/**
 * Check for the user-specified toolchain (and that rustup exists).
 */
export async function ensureToolchain(config: RustupConfig) {
  if (await hasToolchain(config)) {
    return;
  }

  const clicked = await window.showInformationMessage(
    `${config.channel} toolchain not installed. Install?`,
    'Yes',
  );
  if (clicked) {
    await tryToInstallToolchain(config);
  } else {
    throw new Error();
  }
}

/**
 * Checks for required RLS components and prompts the user to install if it's
 * not already.
 */
export async function checkForRls(config: RustupConfig) {
  if (await hasRlsComponents(config)) {
    return;
  }

  const clicked = await Promise.resolve(
    window.showInformationMessage('RLS not installed. Install?', 'Yes'),
  );
  if (clicked) {
    await installRlsComponents(config);
    window.showInformationMessage('RLS successfully installed! Enjoy! 🎉');
  } else {
    throw new Error();
  }
}

async function hasToolchain(config: RustupConfig): Promise<boolean> {
  try {
    const { stdout } = await withWsl(config.useWSL).execFile(config.path, [
      'toolchain',
      'list',
    ]);
    return stdout.includes(config.channel);
  } catch (e) {
    console.log(e);
    const rustupFoundButNotInWSLMode =
      config.useWSL && (await hasRustup({ useWSL: false, ...config }));

    window.showErrorMessage(
      rustupFoundButNotInWSLMode
        ? `Rustup is installed but can't be found under WSL. Ensure that
        invoking \`wsl rustup\` works correctly.`
        : 'Rustup not available. Install from https://www.rustup.rs/',
    );
    throw e;
  }
}

async function tryToInstallToolchain(config: RustupConfig) {
  startSpinner('RLS', 'Installing toolchain…');
  try {
    const { command, args } = withWsl(config.useWSL).modifyArgs(config.path, [
      'toolchain',
      'install',
      config.channel,
    ]);
    await runTaskCommand({ command, args }, 'Installing toolchain…');
    if (!(await hasToolchain(config))) {
      throw new Error();
    }
  } catch (e) {
    console.log(e);
    window.showErrorMessage(`Could not install ${config.channel} toolchain`);
    stopSpinner(`Could not install toolchain`);
    throw e;
  }
}

/**
 * Returns an array of components for specified `config.channel` toolchain.
 * These are parsed as-is, e.g. `rustc-x86_64-unknown-linux-gnu (default)` is a
 * valid listed component name.
 */
async function listComponents(config: RustupConfig): Promise<string[]> {
  return withWsl(config.useWSL)
    .execFile(config.path, ['component', 'list', '--toolchain', config.channel])
    .then(({ stdout }) =>
      stdout
        .toString()
        .replace('\r', '')
        .split('\n'),
    );
}

async function hasRlsComponents(config: RustupConfig): Promise<boolean> {
  try {
    const components = await listComponents(config);

    return REQUIRED_COMPONENTS.map(isInstalledRegex).every(isInstalledRegex =>
      components.some(c => isInstalledRegex.test(c)),
    );
  } catch (e) {
    console.log(e);
    window.showErrorMessage(`Can't detect RLS components: ${e.message}`);
    stopSpinner("Can't detect RLS components");
    throw e;
  }
}

async function installRlsComponents(config: RustupConfig) {
  startSpinner('RLS', 'Installing components…');

  for (const component of REQUIRED_COMPONENTS) {
    try {
      const { command, args } = withWsl(config.useWSL).modifyArgs(config.path, [
        'component',
        'add',
        component,
        '--toolchain',
        config.channel,
      ]);
      await runTaskCommand({ command, args }, `Installing \`${component}\``);

      const isInstalled = isInstalledRegex(component);
      const listedComponents = await listComponents(config);
      if (!listedComponents.some(c => isInstalled.test(c))) {
        throw new Error();
      }
    } catch (e) {
      stopSpinner(`Could not install component \`${component}\``);

      window.showErrorMessage(
        `Could not install component: \`${component}\`${
          e.message ? `, message: ${e.message}` : ''
        }`,
      );
      throw e;
    }
  }

  stopSpinner('RLS components installed successfully');
}

/**
 * Parses given output of `rustup show` and retrieves the local active toolchain.
 */
export function parseActiveToolchain(rustupOutput: string): string {
  // There may a default entry under 'installed toolchains' section, so search
  // for currently active/overridden one only under 'active toolchain' section
  const activeToolchainsIndex = rustupOutput.search('active toolchain');
  if (activeToolchainsIndex !== -1) {
    rustupOutput = rustupOutput.substr(activeToolchainsIndex);

    const matchActiveChannel = /^(\S*) \((?:default|overridden)/gm;
    const match = matchActiveChannel.exec(rustupOutput);
    if (!match) {
      throw new Error(
        `couldn't find active toolchain under 'active toolchains'`,
      );
    } else if (matchActiveChannel.exec(rustupOutput)) {
      throw new Error(
        `multiple active toolchains found under 'active toolchains'`,
      );
    }

    return match[1];
  }

  // Try matching the third line as the active toolchain
  const match = /^(?:.*\r?\n){2}(\S*) \((?:default|overridden)/.exec(
    rustupOutput,
  );
  if (match) {
    return match[1];
  }

  throw new Error(`couldn't find active toolchains`);
}

export async function getVersion(config: RustupConfig): Promise<string> {
  const versionRegex = /rustup ([0-9]+\.[0-9]+\.[0-9]+)/;
  const execFile = withWsl(config.useWSL).execFile;

  const output = await execFile(config.path, ['--version']);
  const versionMatch = output.stdout.toString().match(versionRegex);
  if (versionMatch && versionMatch.length >= 2) {
    return versionMatch[1];
  } else {
    throw new Error("Couldn't parse rustup version");
  }
}

/**
 * Returns whether Rustup is invokable and available.
 */
export function hasRustup(config: RustupConfig): Promise<boolean> {
  return getVersion(config)
    .then(() => true)
    .catch(() => false);
}

/**
 * Returns active (including local overrides) toolchain, as specified by rustup.
 * May throw if rustup at specified path can't be executed.
 */
export function getActiveChannel(wsPath: string, config: RustupConfig): string {
  // rustup info might differ depending on where it's executed
  // (e.g. when a toolchain is locally overriden), so executing it
  // under our current workspace root should give us close enough result

  let activeChannel;
  try {
    // `rustup show active-toolchain` is available since rustup 1.12.0
    activeChannel = withWsl(config.useWSL)
      .execFileSync(config.path, ['show', 'active-toolchain'], { cwd: wsPath })
      .toString()
      .trim();
    // Since rustup 1.17.0 if the active toolchain is the default, we're told
    // by means of a " (default)" suffix, so strip that off if it's present
    // If on the other hand there's an override active, we'll get an
    // " (overridden by ...)" message instead.
    activeChannel = activeChannel.replace(/ \(.*\)$/, '');
  } catch (e) {
    // Possibly an old rustup version, so try rustup show
    const showOutput = withWsl(config.useWSL)
      .execFileSync(config.path, ['show'], { cwd: wsPath })
      .toString();
    activeChannel = parseActiveToolchain(showOutput);
  }

  console.info(
    `Detected active channel: ${activeChannel} (since 'rust-client.channel' is unspecified)`,
  );
  return activeChannel;
}
