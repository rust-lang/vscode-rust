'use strict';

import * as path from 'path';

import * as child_process from 'child_process';

import { workspace, Disposable, ExtensionContext, languages, window } from 'vscode';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind } from 'vscode-languageclient';

export function activate(context: ExtensionContext) {
    const serverOptions = () => new Promise<child_process.ChildProcess>((resolve, reject) => {
        function spawnServer(...args: string[]): child_process.ChildProcess {
			let childProcess = child_process.spawn("rls");
			childProcess.stderr.on('data', data => {});
			return childProcess; // Uses stdin/stdout for communication
		}

		resolve(spawnServer())
	});

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for Rust files
		documentSelector: ['rust'],
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			configurationSection: 'languageServerExample',
			// Notify the server about changes to files contained in the workspace
			//fileEvents: workspace.createFileSystemWatcher('**/*.*')
		},
		errorHandler: {
			closed: function(): any {

			},

			error(error: Error, message: any, count: number): any {

			}
		}
	}
	
	// Create the language client and start the client.
	let lc = new LanguageClient('Rust Language Service', serverOptions, clientOptions);

	lc.onNotification({method: "rustDocument/diagnosticsBegin"}, function(f) {
		window.setStatusBarMessage("RLS analysis: started");
	})
	lc.onNotification({method: "rustDocument/diagnosticsEnd"}, function(f) {
		window.setStatusBarMessage("RLS analysis: done");
	})
	let disposable = lc.start();

	// Push the disposable to the context's subscriptions so that the 
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);
}