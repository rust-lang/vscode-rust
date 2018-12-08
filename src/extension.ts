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
import { activateTaskProvider, runCommand } from './tasks';

import * as child_process from 'child_process';
import * as fs from 'fs';
//import path = require('path');

import {
    commands, ExtensionContext, IndentAction, languages, TextEditor,
    TextEditorEdit, window, workspace, TextDocument, WorkspaceFolder, Disposable, Uri,
    WorkspaceFoldersChangeEvent
} from 'vscode';
import {
    LanguageClient, LanguageClientOptions, Location, NotificationType,
    ServerOptions, ImplementationRequest
} from 'vscode-languageclient';
import { execFile, ExecChildProcessResult } from './utils/child_process';

export async function activate(context: ExtensionContext) {
    configureLanguage(context);

    workspace.onDidOpenTextDocument((doc) => didOpenTextDocument(doc, context));
    workspace.textDocuments.forEach((doc) => didOpenTextDocument(doc, context));
    workspace.onDidChangeWorkspaceFolders((e) => didChangeWorkspaceFolders(e, context));
}

export function deactivate(): Promise<void> {
    const promises: Thenable<void>[] = [];
    for (const ws of workspaces.values()) {
        promises.push(ws.stop());
    }
    return Promise.all(promises).then(() => undefined);
}

// Taken from https://github.com/Microsoft/vscode-extension-samples/blob/master/lsp-multi-server-sample/client/src/extension.ts
function didOpenTextDocument(document: TextDocument, context: ExtensionContext): void {
    if (document.languageId !== 'rust' && document.languageId !== 'toml') {
        return;
    }

    const uri = document.uri;
    let folder = workspace.getWorkspaceFolder(uri);
    if (!folder) {
        return;
    }
    folder = getOuterMostWorkspaceFolder(folder);
    // folder = getCargoTomlWorkspace(folder, document.uri.fsPath);
    if (!folder) {
        stopSpinner(`RLS: Cargo.toml missing`);
        return;
    }

    if (!workspaces.has(folder.uri.toString())) {
        const workspace = new ClientWorkspace(folder);
        workspaces.set(folder.uri.toString(), workspace);
        workspace.start(context);
    }
}

// This is an intermediate, lazy cache used by `getOuterMostWorkspaceFolder`
// and cleared when VSCode workspaces change.
let _sortedWorkspaceFolders: string[] | undefined;

function sortedWorkspaceFolders(): string[] {
    if (!_sortedWorkspaceFolders && workspace.workspaceFolders) {
        _sortedWorkspaceFolders = workspace.workspaceFolders.map(folder => {
            let result = folder.uri.toString();
            if (result.charAt(result.length - 1) !== '/') {
                result = result + '/';
            }
            return result;
        }).sort(
            (a, b) => {
                return a.length - b.length;
            }
        );
    }
    return _sortedWorkspaceFolders || [];
}

// function getCargoTomlWorkspace(cur_workspace: WorkspaceFolder, file_path: string): WorkspaceFolder {
//     if (!cur_workspace) {
//         return cur_workspace;
//     }

//     const workspace_root = path.parse(cur_workspace.uri.fsPath).dir;
//     const root_manifest = path.join(workspace_root, 'Cargo.toml');
//     if (fs.existsSync(root_manifest)) {
//         return cur_workspace;
//     }

//     let current = file_path;

//     while (true) {
//         const old = current;
//         current = path.dirname(current);
//         if (old == current) {
//             break;
//         }
//         if (workspace_root == path.parse(current).dir) {
//             break;
//         }

//         const cargo_path = path.join(current, 'Cargo.toml');
//         if (fs.existsSync(cargo_path)) {
//             return { ...cur_workspace, uri: Uri.parse(current) };
//         }
//     }

//     return cur_workspace;
// }

function getOuterMostWorkspaceFolder(folder: WorkspaceFolder): WorkspaceFolder {
    const sorted = sortedWorkspaceFolders();
    for (const element of sorted) {
        let uri = folder.uri.toString();
        if (uri.charAt(uri.length - 1) !== '/') {
            uri = uri + '/';
        }
        if (uri.startsWith(element)) {
            return workspace.getWorkspaceFolder(Uri.parse(element)) || folder;
        }
    }
    return folder;
}

function didChangeWorkspaceFolders(e: WorkspaceFoldersChangeEvent, context: ExtensionContext): void {
    _sortedWorkspaceFolders = undefined;

    // If a VSCode workspace has been added, check to see if it is part of an existing one, and
    // if not, and it is a Rust project (i.e., has a Cargo.toml), then create a new client.
    for (let folder of e.added) {
        folder = getOuterMostWorkspaceFolder(folder);
        if (workspaces.has(folder.uri.toString())) {
            continue;
        }
        for (const f of fs.readdirSync(folder.uri.fsPath)) {
            if (f === 'Cargo.toml') {
                const workspace = new ClientWorkspace(folder);
                workspaces.set(folder.uri.toString(), workspace);
                workspace.start(context);
                break;
            }
        }
    }

    // If a workspace is removed which is a Rust workspace, kill the client.
    for (const folder of e.removed) {
        const ws = workspaces.get(folder.uri.toString());
        if (ws) {
            workspaces.delete(folder.uri.toString());
            ws.stop();
        }
    }
}

const workspaces: Map<string, ClientWorkspace> = new Map();

// We run one RLS and one corresponding language client per workspace folder
// (VSCode workspace, not Cargo workspace). This class contains all the per-client
// and per-workspace stuff.
class ClientWorkspace {
    // FIXME(#233): Don't only rely on lazily initializing it once on startup,
    // handle possible `rust-client.*` value changes while extension is running
    readonly config: RLSConfiguration;
    lc: LanguageClient | null = null;
    readonly folder: WorkspaceFolder;
    disposables: Disposable[];

    constructor(folder: WorkspaceFolder) {
        this.config = RLSConfiguration.loadFromWorkspace(folder.uri.fsPath);
        this.folder = folder;
        this.disposables = [];
    }

    async start(context: ExtensionContext) {
        warnOnMissingCargoToml();

        startSpinner('RLS', 'Starting');

        this.warnOnRlsToml();
        // Check for deprecated env vars.
        if (process.env.RLS_PATH || process.env.RLS_ROOT) {
            window.showWarningMessage(
                'Found deprecated environment variables (RLS_PATH or RLS_ROOT). Use `rls.path` or `rls.root` settings.'
            );
        }

        const serverOptions: ServerOptions = async () => {
            await this.autoUpdate();
            return this.makeRlsProcess();
        };
        const clientOptions: LanguageClientOptions = {
            // Register the server for Rust files
            documentSelector: [
                { language: 'rust', scheme: 'file', pattern: `${this.folder.uri.fsPath}/**/*` },
                { language: 'rust', scheme: 'untitled', pattern: `${this.folder.uri.fsPath}/**/*` }
            ],
            synchronize: { configurationSection: 'rust' },
            // Controls when to focus the channel rather than when to reveal it in the drop-down list
            revealOutputChannelOn: this.config.revealOutputChannelOn,
            initializationOptions: {
                omitInitBuild: true,
                cmdRun: true,
            },
            workspaceFolder: this.folder,
        };

        // Create the language client and start the client.
        this.lc = new LanguageClient('Rust Language Server', serverOptions, clientOptions);

        const promise = this.progressCounter();

        const disposable = this.lc.start();
        this.disposables.push(disposable);

        this.disposables.push(activateTaskProvider(this.folder));
        this.registerCommands(context);

        return promise;
    }

    registerCommands(context: ExtensionContext) {
        if (!this.lc) {
            return;
        }

        const findImplsDisposable =
            commands.registerTextEditorCommand(
                'rls.findImpls',
                async (textEditor: TextEditor, _edit: TextEditorEdit) => {
                    if (!this.lc) {
                        return;
                    }
                    await this.lc.onReady();
                    // Prior to https://github.com/rust-lang-nursery/rls/pull/936 we used a custom
                    // LSP message - if the implementation provider is specified this means we can use the 3.6 one.
                    const useLSPRequest = this.lc.initializeResult &&
                        this.lc.initializeResult.capabilities.implementationProvider === true;
                    const request = useLSPRequest ? ImplementationRequest.type.method : 'rustDocument/implementations';

                    const params =
                        this.lc
                            .code2ProtocolConverter
                            .asTextDocumentPositionParams(textEditor.document, textEditor.selection.active);
                    let locations: Location[];
                    try {
                        locations = await this.lc.sendRequest<Location[]>(request, params);
                    } catch (reason) {
                        window.showWarningMessage('find implementations failed: ' + reason);
                        return;
                    }

                    return commands.executeCommand(
                        'editor.action.showReferences',
                        textEditor.document.uri,
                        textEditor.selection.active,
                        locations.map(this.lc.protocol2CodeConverter.asLocation)
                    );
                }
            );
        this.disposables.push(findImplsDisposable);

        const rustupUpdateDisposable = commands.registerCommand('rls.update', () => {
            return rustupUpdate(this.config.rustupConfig());
        });
        this.disposables.push(rustupUpdateDisposable);

        const restartServer = commands.registerCommand('rls.restart', async () => {
            await this.stop();
            return this.start(context);
        });
        this.disposables.push(restartServer);

        this.disposables.push(
            commands.registerCommand('rls.run', (cmd) => runCommand(this.folder, cmd))
        );
    }

    async progressCounter() {
        if (!this.lc) {
            return;
        }

        const runningProgress: Set<string> = new Set();
        const asPercent = (fraction: number): string => `${Math.round(fraction * 100)}%`;
        let runningDiagnostics = 0;
        await this.lc.onReady();
        stopSpinner('RLS');

        this.lc.onNotification(new NotificationType('window/progress'), function (progress: any) {
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
        this.lc.onNotification(new NotificationType('rustDocument/beginBuild'), function (_f: any) {
            runningDiagnostics++;
            startSpinner('RLS', 'working');
        });
        this.lc.onNotification(new NotificationType('rustDocument/diagnosticsEnd'), function (_f: any) {
            runningDiagnostics--;
            if (runningDiagnostics <= 0) {
                stopSpinner('RLS');
            }
        });
    }

    async stop() {
        let promise: Thenable<void> = Promise.resolve(void 0);
        if (this.lc) {
            promise = this.lc.stop();
        }
        return promise.then(() => {
            this.disposables.forEach(d => d.dispose());
        });
    }

    async getSysroot(env: Object): Promise<string> {
        let output: ExecChildProcessResult;
        try {
            if (this.config.rustupDisabled) {
                output = await execFile(
                    'rustc', ['--print', 'sysroot'], { env }
                );
            } else {
                output = await execFile(
                    this.config.rustupPath, ['run', this.config.channel, 'rustc', '--print', 'sysroot'], { env }
                );
            }
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
    async makeRlsEnv(setLibPath = false): Promise<any> {
        const env = process.env;

        let sysroot: string | undefined;
        try {
            sysroot = await this.getSysroot(env);
        } catch (err) {
            console.info(err.message);
            console.info(`Let's retry with extended $PATH`);
            env.PATH = `${env.HOME || '~'}/.cargo/bin:${env.PATH || ''}`;
            try {
                sysroot = await this.getSysroot(env);
            } catch (e) {
                console.warn('Error reading sysroot (second try)', e);
                window.showWarningMessage(
                    'RLS could not set RUST_SRC_PATH for Racer because it could not read the Rust sysroot.'
                );
                return env;
            }
        }

        console.info(`Setting sysroot to`, sysroot);
        if (!process.env.RUST_SRC_PATH) {
            env.RUST_SRC_PATH = sysroot + '/lib/rustlib/src/rust/src';
        }
        if (setLibPath) {
            function appendEnv(envVar: string, newComponent: string) {
                const old = process.env[envVar];
                return old ? `${newComponent}:${old}` : newComponent;
            }
            env.DYLD_LIBRARY_PATH = appendEnv('DYLD_LIBRARY_PATH', sysroot + '/lib');
            env.LD_LIBRARY_PATH = appendEnv('LD_LIBRARY_PATH', sysroot + '/lib');
        }

        return env;
    }

    async makeRlsProcess(): Promise<child_process.ChildProcess> {
        // Allow to override how RLS is started up.
        const rls_path = this.config.rlsPath;

        let childProcessPromise: Promise<child_process.ChildProcess>;
        if (rls_path) {
            const env = await this.makeRlsEnv(true);
            console.info('running ' + rls_path);
            childProcessPromise = Promise.resolve(child_process.spawn(rls_path, [], { env }));
        } else if (this.config.rustupDisabled) {
            const env = await this.makeRlsEnv(true);
            console.info('running rls from $PATH');
            childProcessPromise = Promise.resolve(child_process.spawn('rls', [], { env }));
        } else {
            const env = await this.makeRlsEnv();
            console.info('running with rustup');
            childProcessPromise = runRlsViaRustup(env, this.config.rustupConfig());
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

            if (this.config.logToFile) {
                const logPath = this.folder.uri.path + '/rls' + Date.now() + '.log';
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

    async autoUpdate() {
        if (this.config.updateOnStartup && !this.config.rustupDisabled) {
            await rustupUpdate(this.config.rustupConfig());
        }
    }

    warnOnRlsToml() {
        const tomlPath = this.folder.uri.path + '/rls.toml';
        fs.access(tomlPath, fs.constants.F_OK, (err) => {
            if (!err) {
                window.showWarningMessage(
                    'Found deprecated rls.toml. Use VSCode user settings instead (File > Preferences > Settings)'
                );
            }
        });
    }
}

async function warnOnMissingCargoToml() {
    const files = await workspace.findFiles('Cargo.toml');

    if (files.length < 1) {
        window.showWarningMessage(
            'A Cargo.toml file must be at the root of the workspace in order to support all features'
        );
    }
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
