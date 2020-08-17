import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import * as vs from 'vscode';
import * as lc from 'vscode-languageclient';

import { WorkspaceProgress } from './extension';
import { SignatureHelpProvider } from './providers/signatureHelpProvider';
import { ensureComponents, ensureToolchain, rustupUpdate } from './rustup';
import { Observable } from './utils/observable';

const exec = promisify(child_process.exec);

/** Rustup components required for the RLS to work correctly. */
const REQUIRED_COMPONENTS = ['rust-analysis', 'rust-src', 'rls'];

/**
 * VSCode settings to be observed and sent to RLS whenever they change.
 * Previously we just used 'rust' but since RLS warns against unrecognized
 * options and because we want to unify the options behind a single 'rust'
 * namespace for both client/server configuration, we explicitly list the
 * settings previously sent to the RLS.
 * TODO: Replace RLS' configuration setup with workspace/configuration request.
 */
const OBSERVED_SETTINGS = [
  'rust.sysroot',
  'rust.target',
  'rust.rustflags',
  'rust.clear_env_rust_log',
  'rust.build_lib',
  'rust.build_bin',
  'rust.cfg_test',
  'rust.unstable_features',
  'rust.wait_to_build',
  'rust.show_warnings',
  'rust.crate_blacklist',
  'rust.build_on_save',
  'rust.features',
  'rust.all_features',
  'rust.no_default_features',
  'rust.racer_completion',
  'rust.clippy_preference',
  'rust.jobs',
  'rust.all_targets',
  'rust.target_dir',
  'rust.rustfmt_path',
  'rust.build_command',
  'rust.full_docs',
  'rust.show_hover_context',
];

/**
 * Parameter type to `window/progress` request as issued by the RLS.
 * https://github.com/rust-lang/rls/blob/17a439440e6b00b1f014a49c6cf47752ecae5bb7/rls/src/lsp_data.rs#L395-L419
 */
interface ProgressParams {
  id: string;
  title?: string;
  message?: string;
  percentage?: number;
  done?: boolean;
}

export function createLanguageClient(
  folder: vs.WorkspaceFolder,
  config: {
    updateOnStartup?: boolean;
    revealOutputChannelOn?: lc.RevealOutputChannelOn;
    logToFile?: boolean;
    rustup: { disabled: boolean; path: string; channel: string };
    rls: { path?: string };
  },
): lc.LanguageClient {
  const serverOptions: lc.ServerOptions = async () => {
    if (config.updateOnStartup && !config.rustup.disabled) {
      await rustupUpdate(config.rustup);
    }
    return makeRlsProcess(
      config.rustup,
      {
        path: config.rls.path,
        cwd: folder.uri.fsPath,
      },
      { logToFile: config.logToFile },
    );
  };

  const clientOptions: lc.LanguageClientOptions = {
    // Register the server for Rust files
    documentSelector: [
      { language: 'rust', scheme: 'untitled' },
      documentFilter(folder),
    ],
    diagnosticCollectionName: `rust-${folder.uri}`,
    synchronize: { configurationSection: OBSERVED_SETTINGS },
    // Controls when to focus the channel rather than when to reveal it in the drop-down list
    revealOutputChannelOn: config.revealOutputChannelOn,
    initializationOptions: {
      omitInitBuild: true,
      cmdRun: true,
    },
    workspaceFolder: folder,
  };

  return new lc.LanguageClient(
    'rust-client',
    'Rust Language Server',
    serverOptions,
    clientOptions,
  );
}

export function setupClient(
  client: lc.LanguageClient,
  folder: vs.WorkspaceFolder,
): vs.Disposable[] {
  return [
    vs.languages.registerSignatureHelpProvider(
      documentFilter(folder),
      new SignatureHelpProvider(client),
      '(',
      ',',
    ),
  ];
}

export function setupProgress(
  client: lc.LanguageClient,
  observableProgress: Observable<WorkspaceProgress>,
) {
  const runningProgress: Set<string> = new Set();
  // We can only register notification handler after the client is ready
  client.onReady().then(() =>
    client.onNotification(
      new lc.NotificationType<ProgressParams, void>('window/progress'),
      progress => {
        if (progress.done) {
          runningProgress.delete(progress.id);
        } else {
          runningProgress.add(progress.id);
        }
        if (runningProgress.size) {
          let status = '';
          if (typeof progress.percentage === 'number') {
            status = `${Math.round(progress.percentage * 100)}%`;
          } else if (progress.message) {
            status = progress.message;
          } else if (progress.title) {
            status = `[${progress.title.toLowerCase()}]`;
          }
          observableProgress.value = { state: 'progress', message: status };
        } else {
          observableProgress.value = { state: 'ready' };
        }
      },
    ),
  );
}

function documentFilter(folder: vs.WorkspaceFolder): lc.DocumentFilter {
  // This accepts `vscode.GlobPattern` under the hood, which requires only
  // forward slashes. It's worth mentioning that RelativePattern does *NOT*
  // work in remote scenarios (?), so rely on normalized fs path from VSCode URIs.
  const pattern = `${folder.uri.fsPath.replace(path.sep, '/')}/**`;

  return { language: 'rust', scheme: 'file', pattern };
}

async function getSysroot(
  rustup: { disabled: boolean; path: string; channel: string },
  env: typeof process.env,
): Promise<string> {
  const printSysrootCmd = rustup.disabled
    ? 'rustc --print sysroot'
    : `${rustup.path} run ${rustup.channel} rustc --print sysroot`;

  const { stdout } = await exec(printSysrootCmd, { env });
  return stdout.toString().trim();
}

// Make an evironment to run the RLS.
async function makeRlsEnv(
  rustup: { disabled: boolean; path: string; channel: string },
  opts = {
    setLibPath: false,
  },
): Promise<typeof process.env> {
  // Shallow clone, we don't want to modify this process' $PATH or
  // $(DY)LD_LIBRARY_PATH
  const env = { ...process.env };

  let sysroot: string | undefined;
  try {
    sysroot = await getSysroot(rustup, env);
  } catch (err) {
    console.info(err.message);
    console.info(`Let's retry with extended $PATH`);
    env.PATH = `${env.HOME || '~'}/.cargo/bin:${env.PATH || ''}`;
    try {
      sysroot = await getSysroot(rustup, env);
    } catch (e) {
      console.warn('Error reading sysroot (second try)', e);
      vs.window.showWarningMessage(`Error reading sysroot: ${e.message}`);
      return env;
    }
  }

  console.info(`Setting sysroot to`, sysroot);
  if (opts.setLibPath) {
    const appendEnv = (envVar: string, newComponent: string) => {
      const old = process.env[envVar];
      return old ? `${newComponent}:${old}` : newComponent;
    };
    const newComponent = path.join(sysroot, 'lib');
    env.DYLD_LIBRARY_PATH = appendEnv('DYLD_LIBRARY_PATH', newComponent);
    env.LD_LIBRARY_PATH = appendEnv('LD_LIBRARY_PATH', newComponent);
  }

  return env;
}

async function makeRlsProcess(
  rustup: { disabled: boolean; path: string; channel: string },
  rls: { path?: string; cwd: string },
  options: { logToFile?: boolean } = {},
): Promise<child_process.ChildProcess> {
  // Run "rls" from the PATH unless there's an override.
  const rlsPath = rls.path || 'rls';
  const cwd = rls.cwd;

  let childProcess: child_process.ChildProcess;
  if (rustup.disabled) {
    console.info(`running without rustup: ${rlsPath}`);
    // Set [DY]LD_LIBRARY_PATH ourselves, since that's usually done automatically
    // by rustup when it chooses a toolchain
    const env = await makeRlsEnv(rustup, { setLibPath: true });

    childProcess = child_process.spawn(rlsPath, [], {
      env,
      cwd,
      shell: true,
    });
  } else {
    console.info(`running with rustup: ${rlsPath}`);
    const config = rustup;

    await ensureToolchain(config);
    if (!rls.path) {
      // We only need a rustup-installed RLS if we weren't given a
      // custom RLS path.
      console.info('will use a rustup-installed RLS; ensuring present');
      await ensureComponents(config, REQUIRED_COMPONENTS);
    }

    const env = await makeRlsEnv(rustup, { setLibPath: false });
    childProcess = child_process.spawn(
      config.path,
      ['run', config.channel, rlsPath],
      { env, cwd, shell: true },
    );
  }

  childProcess.on('error', (err: { code?: string; message: string }) => {
    if (err.code === 'ENOENT') {
      console.error(`Could not spawn RLS: ${err.message}`);
      vs.window.showWarningMessage(`Could not spawn RLS: \`${err.message}\``);
    }
  });

  if (options.logToFile) {
    const logPath = path.join(rls.cwd, `rls${Date.now()}.log`);
    const logStream = fs.createWriteStream(logPath, { flags: 'w+' });
    childProcess.stderr?.pipe(logStream);
  }

  return childProcess;
}
