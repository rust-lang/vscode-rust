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
import { get_content } from './utils/get_content';

import { commands, ExtensionContext, Hover, IndentAction, languages, TextEditor,
    TextEditorEdit, window, workspace, TextDocument, Range } from 'vscode';
import { LanguageClient, LanguageClientOptions, Location, NotificationType,
    ServerOptions } from 'vscode-languageclient';

// FIXME(#233): Don't only rely on lazily initializing it once on startup,
// handle possible `rust-client.*` value changes while extension is running
export const CONFIGURATION = RLSConfiguration.loadFromWorkspace();

const CRATES_API = 'https://crates.io/api/v1/crates/';

function getSysroot(env: Object): string | Error {
    const rustcSysroot = child_process.spawnSync(
        CONFIGURATION.rustupPath, ['run', CONFIGURATION.channel, 'rustc', '--print', 'sysroot'], {env}
    );

    if (rustcSysroot.error) {
        return new Error(`Error running \`rustc\`: ${rustcSysroot.error}`);
    }

    if (rustcSysroot.status > 0) {
        return new Error(`Error getting sysroot from \`rustc\`: exited with \`${rustcSysroot.status}\``);
    }

    if (!rustcSysroot.stdout || typeof rustcSysroot.stdout.toString !== 'function') {
        return new Error(`Couldn't get sysroot from \`rustc\`: Got no ouput`);
    }

    const sysroot = rustcSysroot.stdout.toString()
        .replace('\n', '').replace('\r', '');

    return sysroot;
}

// Make an evironment to run the RLS.
// Tries to synthesise RUST_SRC_PATH for Racer, if one is not already set.
function makeRlsEnv(setLibPath = false): any {
    const env = process.env;

    let result = getSysroot(env);
    if (result instanceof Error) {
        console.info(result.message);
        console.info(`Let's retry with extended $PATH`);
        env.PATH = `${env.HOME || '~'}/.cargo/bin:${env.PATH || ''}`;
        result = getSysroot(env);

        if (result instanceof Error) {
            console.warn('Error reading sysroot (second try)', result);
            window.showWarningMessage('RLS could not set RUST_SRC_PATH for Racer because it could not read the Rust sysroot.');
        }
    }
    if (typeof result === 'string') {
        console.info(`Setting sysroot to`, result);
        if ( ! process.env.RUST_SRC_PATH) {
            env.RUST_SRC_PATH = result + '/lib/rustlib/src/rust/src';
        }
        if (setLibPath) {
            env.DYLD_LIBRARY_PATH = result + '/lib';
            env.LD_LIBRARY_PATH = result + '/lib';
        }
    }

    return env;
}

function makeRlsProcess(): Promise<child_process.ChildProcess> {
    // Allow to override how RLS is started up.
    const rls_path = CONFIGURATION.rlsPath;
    const rls_root = CONFIGURATION.rlsRoot;

    let childProcessPromise: Promise<child_process.ChildProcess>;
    if (rls_path) {
        const env = makeRlsEnv(true);
        console.info('running ' + rls_path);
        childProcessPromise = Promise.resolve(child_process.spawn(rls_path, [], { env }));
    } else if (rls_root) {
        const env = makeRlsEnv();
        console.info('running `cargo run` in ' + rls_root);
        childProcessPromise = Promise.resolve(child_process.spawn(
            CONFIGURATION.rustupPath, ['run', CONFIGURATION.channel, 'cargo', 'run', '--release'],
          {cwd: rls_root, env})
        );
    } else {
        const env = makeRlsEnv();
        console.info('running with rustup');
        childProcessPromise = runRlsViaRustup(env);
    }

    childProcessPromise.then((childProcess) => {
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
    });

    return childProcessPromise.catch(() => {
        window.setStatusBarMessage('RLS could not be started');
        return Promise.reject(undefined);
    });
}

let lc : LanguageClient;

export function activate(context: ExtensionContext) {
    configureLanguage(context);
    startLanguageClient(context);
    registerCommands(context);
    registerHovers(context);
    activateTaskProvider();
}

function startLanguageClient(context: ExtensionContext)
{
    if (workspace.rootPath === undefined) {
        window.showWarningMessage('Startup error: the RLS can only operate on a folder, not a single file');
        return;
    }
    warnOnMissingCargoToml();

    window.setStatusBarMessage('RLS: starting up');

    warnOnRlsToml();
    // Check for deprecated env vars.
    if (process.env.RLS_PATH || process.env.RLS_ROOT) {
        window.showWarningMessage('Found deprecated environment variables (RLS_PATH or RLS_ROOT). Use `rls.path` or `rls.root` settings.');
    }

    const serverOptions: ServerOptions = () => autoUpdate().then(() => makeRlsProcess());
    const clientOptions: LanguageClientOptions = {
        // Register the server for Rust files
        documentSelector: ['rust'],
        synchronize: { configurationSection: 'rust' },
        // Controls when to focus the channel rather than when to reveal it in the drop-down list
        revealOutputChannelOn: CONFIGURATION.revealOutputChannelOn,
        initializationOptions: { omitInitBuild: true },
    };

    // Create the language client and start the client.
    lc = new LanguageClient('Rust Language Server', serverOptions, clientOptions);

    diagnosticCounter();

    const disposable = lc.start();
    context.subscriptions.push(disposable);
}

export function deactivate(): Promise<void> {
    deactivateTaskProvider();

    return Promise.resolve();
}

function warnOnMissingCargoToml() {
    workspace.findFiles('Cargo.toml').then(files => {
        if (files.length < 1) {
            window.showWarningMessage('A Cargo.toml file must be at the root of the workspace in order to support all features');
        }
    });
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

function diagnosticCounter() {
    let runningDiagnostics = 0;
    lc.onReady().then(() => {
        lc.onNotification(new NotificationType('rustDocument/beginBuild'), function(_f: any) {
            runningDiagnostics++;
            startSpinner('RLS: working');
        });
        lc.onNotification(new NotificationType('rustDocument/diagnosticsEnd'), function(_f: any) {
            runningDiagnostics--;
            if (runningDiagnostics <= 0) {
                stopSpinner('RLS: done');
            }
        });
    });
}

function findDependencyRange(document: TextDocument) {
    const text = document.getText();
    const startOffset = text.search(/^\[dependencies\]/gm);
    const endOffset = text.slice(startOffset + 13).search(/\[|$/);
    const startPosition = document.positionAt(startOffset);
    const endPosition = document.positionAt(startOffset + 13 + endOffset);
    return (startPosition && endPosition) ? new Range(startPosition, endPosition) : undefined;
}

function registerHovers(context: ExtensionContext) {
    if (CONFIGURATION.fetchCrateInfo) {
        const state: {[idx: string]: string} = {};
        const crateLookupDisposable = languages.registerHoverProvider({'language': 'toml', 'pattern': '**/Cargo.toml'}, {
            provideHover(document, position, _token) {
                const range = document.getWordRangeAtPosition(position,/[a-zA-Z][a-zA-Z0-9-_]*|_[a-zA-Z0-9-_]+/);
                if (range === undefined || range.start.character != 0) { return undefined; }
                const dependencyRange = findDependencyRange(document);
                if ( dependencyRange === undefined || ! dependencyRange.contains(range)) { return undefined; }
                const crate = document.getText(range); // Poor heuristic: Actually any word that begins a line
                const crateKey = crate;
                const crateInfo = state[crateKey];
                if (crateInfo) {
                    return new Hover(crateInfo);
                } else {
                    return get_content(CRATES_API + crate)
                    .then((response) => {
                        const resObj = JSON.parse(response);
                        const crateInfo = `${resObj.crate.description}\n\nLatest version: ${resObj.crate.max_version}`;
                        state[crateKey] = crateInfo;
                        return new Hover(crateInfo);}
                    ).catch(() => undefined);
                }
            }
        });
        context.subscriptions.push(crateLookupDisposable);
    }
}
function registerCommands(context: ExtensionContext) {
    const findImplsDisposable = commands.registerTextEditorCommand('rls.findImpls', (textEditor: TextEditor, _edit: TextEditorEdit) => {
        lc.onReady().then(() => {
            const params = lc.code2ProtocolConverter.asTextDocumentPositionParams(textEditor.document, textEditor.selection.active);
            lc.sendRequest<Location[]>('rustDocument/implementations', params)
                .then((locations: Location[]) => {
                    commands.executeCommand('editor.action.showReferences', textEditor.document.uri, textEditor.selection.active, locations.map(lc.protocol2CodeConverter.asLocation));
                }, (reason) => {
                    window.showWarningMessage('find implementations failed: ' + reason);
                });
        });
    });
    context.subscriptions.push(findImplsDisposable);

    const rustupUpdateDisposable = commands.registerCommand('rls.update', () => {
        rustupUpdate();
    });
    context.subscriptions.push(rustupUpdateDisposable);

    const restartServer = commands.registerCommand('rls.restart', () => {
        lc.stop().then(() => startLanguageClient(context));
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
