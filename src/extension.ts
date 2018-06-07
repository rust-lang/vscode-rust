// Copyright 2017 The RLS Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

'use strict';

import { runRlsViaRustup, rustupUpdate } from './rustup';
import { startSpinner, stopSpinner } from './spinner';
import { RLSConfiguration } from './configuration';
import { activateTaskProvider, deactivateTaskProvider } from './tasks';

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { commands, ExtensionContext, IndentAction, languages, TextEditor,
    TextEditorEdit, window, workspace, Uri } from 'vscode';
import { LanguageClient, LanguageClientOptions, Location, NotificationType,
    ServerOptions } from 'vscode-languageclient';
import { execFile, ExecChildProcessResult } from './utils/child_process';

// FIXME(#233): Don't only rely on lazily initializing it once on startup,
// handle possible `rust-client.*` value changes while extension is running
export const CONFIGURATION = RLSConfiguration.loadFromWorkspace();

async function getSysroot(env: Object): Promise<string> {
    let output: ExecChildProcessResult;
    try {
        output = await execFile(
            CONFIGURATION.rustupPath, ['run', CONFIGURATION.channel, 'rustc', '--print', 'sysroot'], { env }
        );
    } catch (e) {
        throw new Error(`Error getting sysroot from \`rustc\`: ${e}`);
    }

    if (!output.stdout) {
        throw new Error(`Couldn't get sysroot from \`rustc\`: Got no ouput`);
    }

    return output.stdout.replace('\n', '').replace('\r', '');
}

// Make an evironment to run the RLS.
// Tries to synthesise RUST_SRC_PATH for Racer, if one is not already set.
async function makeRlsEnv(setLibPath = false): Promise<any> {
    const env = process.env;

    let sysroot: string | undefined;
    try {
        sysroot = await getSysroot(env);
    } catch (err) {
        console.info(err.message);
        console.info(`Let's retry with extended $PATH`);
        env.PATH = `${env.HOME || '~'}/.cargo/bin:${env.PATH || ''}`;
        try {
            sysroot = await getSysroot(env);
        } catch (e) {
            console.warn('Error reading sysroot (second try)', e);
            window.showWarningMessage('RLS could not set RUST_SRC_PATH for Racer because it could not read the Rust sysroot.');
        }
    }

    console.info(`Setting sysroot to`, sysroot);
    if (!process.env.RUST_SRC_PATH) {
        env.RUST_SRC_PATH = sysroot + '/lib/rustlib/src/rust/src';
    }
    if (setLibPath) {
        env.DYLD_LIBRARY_PATH = sysroot + '/lib';
        env.LD_LIBRARY_PATH = sysroot + '/lib';
    }

    return env;
}

async function makeRlsProcess(): Promise<child_process.ChildProcess> {
    // Allow to override how RLS is started up.
    const rls_path = CONFIGURATION.rlsPath;

    let childProcessPromise: Promise<child_process.ChildProcess>;
    const cargoSubdir = workspace.getConfiguration().get('rust-client.cargoSubdir');
    const cargo_toml_path = workspace.rootPath + ( cargoSubdir ? '/'+cargoSubdir : '');
    if (rls_path) {
        const env = await makeRlsEnv(true);
        console.info('running ' + rls_path + ' using CWD "'+cargo_toml_path+'"');
        childProcessPromise = Promise.resolve(child_process.spawn(rls_path, [], { cwd: cargo_toml_path, env }));
    } else {
        const env = await makeRlsEnv();
        console.info('running with rustup using CWD "'+cargo_toml_path+'"');
        const env_2 = {...env, cwd: cargo_toml_path};
        console.info(env_2);
        console.info(cargo_toml_path);
        childProcessPromise = runRlsViaRustup(env_2);
    }
    try {
        const childProcess = await childProcessPromise;

        childProcess.on('error', err => {
            if ((<any>err).code == 'ENOENT') {
                console.error('Could not spawn RLS process: ', err.message);
                window.showWarningMessage('Could not start RLS');
            } else {
                throw err;
            }
        });

        if (CONFIGURATION.logToFile) {
            const logPath = workspace.rootPath + '/rls' + Date.now() + '.log';
            const logStream = fs.createWriteStream(logPath, { flags: 'w+' });
            logStream.on('open', function (_f) {
                childProcess.stderr.addListener('data', function (chunk) {
                    logStream.write(chunk.toString());
                });
            }).on('error', function (err: any) {
                console.error("Couldn't write to " + logPath + ' (' + err + ')');
                logStream.end();
            });
        }

        return childProcess;
    } catch (e) {
        stopSpinner('RLS could not be started');
        throw new Error('Error starting up rls.');
    }
}

let lc: LanguageClient;

export async function activate(context: ExtensionContext) {
    const promise = startLanguageClient(context);
    configureLanguage(context);
    registerCommands(context);
    activateTaskProvider();
    await promise;
}

async function startLanguageClient(context: ExtensionContext) {
    if (workspace.rootPath === undefined || !workspace.workspaceFolders) {
        window.showWarningMessage('Startup error: the RLS can only operate on a folder, not a single file');
        return;
    }

    // These methods cannot throw an error, so we can drop it.
    warnOnMissingCargoToml();

    startSpinner('RLS', 'Starting');

    warnOnRlsToml();
    // Check for deprecated env vars.
    if (process.env.RLS_PATH || process.env.RLS_ROOT) {
        window.showWarningMessage('Found deprecated environment variables (RLS_PATH or RLS_ROOT). Use `rls.path` or `rls.root` settings.');
    }

    const serverOptions: ServerOptions = async () => {
        await autoUpdate();
        return makeRlsProcess();
    };
    const cargoSubdir = workspace.getConfiguration().get('rust-client.cargoSubdir');
    const workspaceFolder = workspace.workspaceFolders[0];
    const clientOptions: LanguageClientOptions = {
        // Register the server for Rust files
        documentSelector: [
            { language: 'rust', scheme: 'file' },
            { language: 'rust', scheme: 'untitled' }
        ],
        synchronize: { configurationSection: 'rust' },
        // Controls when to focus the channel rather than when to reveal it in the drop-down list
        revealOutputChannelOn: CONFIGURATION.revealOutputChannelOn,
        initializationOptions: { omitInitBuild: true },
        workspaceFolder: {...workspaceFolder,
            uri: Uri.parse('file://' + workspace.rootPath + (cargoSubdir ? '/'+cargoSubdir : ''))}
    };

    // Create the language client and start the client.
    lc = new LanguageClient('Rust Language Server', serverOptions, clientOptions);

    const promise = progressCounter();

    const disposable = lc.start();
    context.subscriptions.push(disposable);

    return promise;
}

export function deactivate(): Promise<void> {
    deactivateTaskProvider();

    lc.stop();

    return Promise.resolve();
}

async function warnOnMissingCargoToml() {
    const setting_section = 'rust-client.cargoSubdir';
    const root_toml_files = await workspace.findFiles('Cargo.toml');

    if (root_toml_files.length < 1) {
        const subdir_toml_files = await workspace.findFiles('**/Cargo.toml');
        const setting_value = workspace.getConfiguration().get(setting_section);
        if (subdir_toml_files.length < 1) {
            window.showWarningMessage(`The Cargo.toml file has not been found at
            the root of the workspace or anywhere else. In order to support all
            RLS features, some Cargo.toml must be present.`);

        } else if (! setting_value) {
            const subdir = path.dirname(workspace.asRelativePath(subdir_toml_files[0]));
            const item_save_to_settings = `Save to '.vscode/settings.json'`;
            window.showWarningMessage(`A Cargo.toml has been found in the sudirectory '${subdir}/'.
            Although RLS expects Cargo.toml to be at the root of the workspace,
            we can set this path using the '${setting_section}' setting in your
            '.vscode/settings.json'`, ...[item_save_to_settings])
                .then(v => {
                    switch (v) {
                        case item_save_to_settings:
                            workspace.getConfiguration().update(setting_section, subdir);
                            break;
                        default:
                            break;
                    }
                });
        }
    }
}

function warnOnRlsToml() {
    const tomlPath = workspace.rootPath + '/rls.toml';
    fs.access(tomlPath, fs.constants.F_OK, (err) => {
        if (!err) {
            window.showWarningMessage('Found deprecated rls.toml. Use VSCode user settings instead (File > Preferences > Settings)');
        }
    });
}

async function autoUpdate() {
    if (CONFIGURATION.updateOnStartup) {
        await rustupUpdate();
    }
}

async function progressCounter() {
    const runningProgress: Set<string> = new Set();
    const asPercent = (fraction: number): string => `${Math.round(fraction * 100)}%`;
    let runningDiagnostics = 0;
    await lc.onReady();
    stopSpinner('RLS');

    lc.onNotification(new NotificationType('window/progress'), function (progress: any) {
        if (progress.done) {
            runningProgress.delete(progress.id);
        } else {
            runningProgress.add(progress.id);
        }
        if (runningProgress.size) {
            let status = '';
            if (typeof progress.percentage === 'number') {
                status = asPercent(progress.percentage);
            } else if (progress.message) {
                status = progress.message;
            } else if (progress.title) {
                status = `[${progress.title.toLowerCase()}]`;
            }
            startSpinner('RLS', status);
        } else {
            stopSpinner('RLS');
        }
    });

    // FIXME these are legacy notifications used by RLS ca jan 2018.
    // remove once we're certain we've progress on.
    lc.onNotification(new NotificationType('rustDocument/beginBuild'), function (_f: any) {
        runningDiagnostics++;
        startSpinner('RLS', 'working');
    });
    lc.onNotification(new NotificationType('rustDocument/diagnosticsEnd'), function (_f: any) {
        runningDiagnostics--;
        if (runningDiagnostics <= 0) {
            stopSpinner('RLS');
        }
    });
}

function registerCommands(context: ExtensionContext) {
    const findImplsDisposable = commands.registerTextEditorCommand('rls.findImpls', async (textEditor: TextEditor, _edit: TextEditorEdit) => {
        await lc.onReady();

        const params = lc.code2ProtocolConverter.asTextDocumentPositionParams(textEditor.document, textEditor.selection.active);
        let locations: Location[];
        try {
            locations = await lc.sendRequest<Location[]>('rustDocument/implementations', params);
        } catch (reason) {
            window.showWarningMessage('find implementations failed: ' + reason);
            return;
        }


        return commands.executeCommand('editor.action.showReferences', textEditor.document.uri, textEditor.selection.active, locations.map(lc.protocol2CodeConverter.asLocation));
    });
    context.subscriptions.push(findImplsDisposable);

    const rustupUpdateDisposable = commands.registerCommand('rls.update', () => {
        return rustupUpdate();
    });
    context.subscriptions.push(rustupUpdateDisposable);

    const restartServer = commands.registerCommand('rls.restart', async () => {
        await lc.stop();
        return startLanguageClient(context);
    });
    context.subscriptions.push(restartServer);
}

function configureLanguage(context: ExtensionContext) {
    const disposable = languages.setLanguageConfiguration('rust', {
        onEnterRules: [
            {
                // Doc single-line comment
                // e.g. ///|
                beforeText: /^\s*\/{3}.*$/,
                action: { indentAction: IndentAction.None, appendText: '/// ' },
            },
            {
                // Parent doc single-line comment
                // e.g. //!|
                beforeText: /^\s*\/{2}\!.*$/,
                action: { indentAction: IndentAction.None, appendText: '//! ' },
            },
            {
                // Begins an auto-closed multi-line comment (standard or parent doc)
                // e.g. /** | */ or /*! | */
                beforeText: /^\s*\/\*(\*|\!)(?!\/)([^\*]|\*(?!\/))*$/,
                afterText: /^\s*\*\/$/,
                action: { indentAction: IndentAction.IndentOutdent, appendText: ' * ' }
            },
            {
                // Begins a multi-line comment (standard or parent doc)
                // e.g. /** ...| or /*! ...|
                beforeText: /^\s*\/\*(\*|\!)(?!\/)([^\*]|\*(?!\/))*$/,
                action: { indentAction: IndentAction.None, appendText: ' * ' }
            },
            {
                // Continues a multi-line comment
                // e.g.  * ...|
                beforeText: /^(\ \ )*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
                action: { indentAction: IndentAction.None, appendText: '* ' }
            },
            {
                // Dedents after closing a multi-line comment
                // e.g.  */|
                beforeText: /^(\ \ )*\ \*\/\s*$/,
                action: { indentAction: IndentAction.None, removeText: 1 }
            }
        ]
    });
    context.subscriptions.push(disposable);
}
