'use strict';

import * as path from 'path';

import * as child_process from 'child_process';

import { workspace, Disposable, ExtensionContext, languages, window } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';

let DEV_MODE = false;

class Counter {
    count: number;

    constructor() {
        this.count = 0;
    }

    increment() {
        this.count += 1;
    }

    decrementAndGet() {
        this.count -= 1;
        if (this.count < 0) {
            this.count = 0;
        }
        return this.count;
    }
}

export function activate(context: ExtensionContext) {
    let serverOptions: ServerOptions;

    let rlsCargoPath = "";
    if (process.env.RLS_ROOT) {
        rlsCargoPath = path.join(process.env.RLS_ROOT, "Cargo.toml");
    }

    if (DEV_MODE) {
        if (rlsCargoPath) {
            serverOptions = {
                run: {command: "cargo", args: ["run", "--manifest-path=" + rlsCargoPath, "--release"]},
                debug: {command: "cargo", args: ["run", "--manifest-path=" + rlsCargoPath, "--release"]}
            };
        }
        else {
            serverOptions = {
                run: {command: "rls"},
                debug: {command: "rls"}
            };
            
        }
    } else {
        if (rlsCargoPath) {
            serverOptions = () => new Promise<child_process.ChildProcess>((resolve, reject) => {
                function spawnServer(...args: string[]): child_process.ChildProcess {
                    let childProcess = child_process.spawn("cargo", ["run", "--manifest-path=" + rlsCargoPath, "--release"]);
                    childProcess.stderr.on('data', data => {});
                    return childProcess; // Uses stdin/stdout for communication
                }

                resolve(spawnServer())
            });
        }
        else {
            serverOptions = () => new Promise<child_process.ChildProcess>((resolve, reject) => {
                function spawnServer(...args: string[]): child_process.ChildProcess {
                    let childProcess = child_process.spawn("rls");
                    childProcess.stderr.on('data', data => {});
                    return childProcess; // Uses stdin/stdout for communication
                }

                resolve(spawnServer())
            });
        }
    }

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for Rust files
        documentSelector: ['rust'],
        synchronize: {
            // Synchronize the setting section 'languageServerExample' to the server
            configurationSection: 'languageServerExample',
            // Notify the server about changes to files contained in the workspace
            //fileEvents: workspace.createFileSystemWatcher('**/*.*')
        }
    }
    
    // Create the language client and start the client.
    let lc = new LanguageClient('Rust Language Server', serverOptions, clientOptions);

    let runningDiagnostics = new Counter();
    lc.onNotification({method: "rustDocument/diagnosticsBegin"}, function(f) {
        runningDiagnostics.increment();
        window.setStatusBarMessage("RLS analysis: started");
    })
    lc.onNotification({method: "rustDocument/dataProcessingDone"}, function(f) {
        let count = runningDiagnostics.decrementAndGet()
        if (count == 0) {
            window.setStatusBarMessage("RLS analysis: done");
        }
    })
    let disposable = lc.start();

    // Push the disposable to the context's subscriptions so that the 
    // client can be deactivated on extension deactivation
    context.subscriptions.push(disposable);
}
