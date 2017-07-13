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

import { runRlsViaRustup } from './rustup';
import { startSpinner, stopSpinner } from './spinner';

import * as child_process from 'child_process';
import * as fs from 'fs';

import { workspace, ExtensionContext, window, commands, OutputChannel } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind, NotificationType } from 'vscode-languageclient';
import * as is from 'vscode-languageclient/lib/utils/is';

const HIDE_WINDOW_OUTPUT = true;
const LOG_TO_FILE = false;

function makeRlsProcess(lcOutputChannel: OutputChannel): Promise<child_process.ChildProcess> {
    const rls_path = process.env.RLS_PATH;
    const rls_root = process.env.RLS_ROOT;

    let childProcessPromise;
    if (rls_path) {
        childProcessPromise = Promise.resolve(child_process.spawn(rls_path));
    } else if (rls_root) {
        childProcessPromise = Promise.resolve(child_process.spawn("cargo", ["run", "--release"], { cwd: rls_root }));
    } else {
        childProcessPromise = runRlsViaRustup();
    }

    childProcessPromise.then((childProcess) => {
        childProcess.on('error', err => {
            if ((<any>err).code == "ENOENT") {
                console.error("Could not spawn RLS process: ", err.message);
                window.showWarningMessage("Could not start RLS");
            } else {
                throw err;
            }
        });

        if (LOG_TO_FILE) {
            const logPath = workspace.rootPath + '/rls' + Date.now() + '.log';
            let logStream = fs.createWriteStream(logPath, { flags: 'w+' });
            logStream.on('open', function (f) {
                childProcess.stderr.addListener("data", function (chunk) {
                    logStream.write(chunk.toString());
                });
            }).on('error', function (err) {
                console.error("Couldn't write to " + logPath + " (" + err + ")");
                logStream.end();
            });
        }

        childProcess.stderr.on('data', data => {
            if (!HIDE_WINDOW_OUTPUT && lcOutputChannel) {
                lcOutputChannel.append(is.string(data) ? data : data.toString('utf8'));
                lcOutputChannel.show();
            }
        });
    });

    return childProcessPromise.catch(() => {
        window.setStatusBarMessage("RLS could not be started");
    });
}

export function activate(context: ExtensionContext) {
    window.setStatusBarMessage("RLS analysis: starting up");

    // FIXME(#66): Hack around stderr not being output to the window if ServerOptions is a function
    let lcOutputChannel: OutputChannel = null;

    const tomlPath = workspace.rootPath + '/rls.toml';
    fs.access(tomlPath, fs.constants.F_OK, (err) => {
        if (!err) {
            window.showWarningMessage('Found deprecated rls.toml. Use VSCode user settings instead (File > Preferences > Settings)');
        }
    });

    let serverOptions: ServerOptions = () => makeRlsProcess(lcOutputChannel);

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for Rust files
        documentSelector: ['rust'],
        synchronize: {
            configurationSection: 'rust'
        }
    };

    // Create the language client and start the client.
    let lc = new LanguageClient('Rust Language Server', serverOptions, clientOptions);
    lcOutputChannel = lc.outputChannel;

    let runningDiagnostics = 0;    
    lc.onReady().then(() => {
        lc.onNotification(new NotificationType('rustDocument/diagnosticsBegin'), function(f) {
            runningDiagnostics++;
            startSpinner("RLS analysis: working");
        });
        lc.onNotification(new NotificationType('rustDocument/diagnosticsEnd'), function(f) {
            runningDiagnostics--;
            if (runningDiagnostics <= 0) {
                stopSpinner("RLS analysis: done");
            }
        });
    });

    let cmdDisposable = commands.registerTextEditorCommand('rls.deglob', (textEditor, edit) => {
        lc.sendRequest('rustWorkspace/deglob', { uri: textEditor.document.uri.toString(), range: textEditor.selection })
            .then((result) => {},
                  (reason) => {
                window.showWarningMessage('deglob command failed: ' + reason);
            });
    });
    context.subscriptions.push(cmdDisposable);

    let config = workspace.getConfiguration();
    if (!config['tasks']) {
        const tasks = {
            "version": "0.1.0",
            "command": "cargo",
            "isShellCommand": true,
            "showOutput": "always",
            "suppressTaskName": true,
            "tasks": [
                {
                    "taskName": "cargo build",
                    "args": ["build"],
                    "isBuildCommand": true
                },
                {
                    "taskName": "cargo run",
                    "args": ["run"]
                },
                {
                    "taskName": "cargo test",
                    "args": ["test"],
                    "isTestCommand": true
                }
            ],
        };
        config.update('tasks', tasks, false)
    }

    let disposable = lc.start();
    context.subscriptions.push(disposable);
}
