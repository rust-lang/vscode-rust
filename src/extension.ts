'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import http = require('http');
import request = require('request');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    vscode.languages.registerHoverProvider('rust', {
        provideHover(document, position, token) {
            return new vscode.Hover('I am a hover!');
        }
    });

    vscode.languages.registerCompletionItemProvider("rust", new RustCompletionProvider(), ".");
}

function build_input_pos(document: vscode.TextDocument, position: vscode.Position): string {
    let range = document.getWordRangeAtPosition(position);
    if (range) {
        return JSON.stringify({
            pos: {
                filepath: document.fileName,
                line: position.line+1,
                col: position.character
            },
            span: {
                file_name: document.fileName,
                line_start: range.start.line,
                column_start: range.start.character,
                line_end: range.end.line,
                column_end: range.end.character
            }});
    }
    else {
        return JSON.stringify({
            pos: {
                filepath: document.fileName,
                line: position.line+1,
                col: position.character
            },
            span: {
                file_name: document.fileName,
                line_start: position.line+1,
                column_start: position.character,
                line_end: position.line+1,
                column_end: position.character+1
            }});        
    }
}

class RustCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position,
        token: vscode.CancellationToken): Promise<vscode.CompletionList> {
        return new Promise<vscode.CompletionList>((resolve, reject) => {
            document.save().then(() => request({
                url: "http://127.0.0.1:9000/complete",
                method: "POST",
                json: true,
                body: build_input_pos(document, position)
            }, function(err, res, body) {
                let results = [];
                for (let o in body) {
                    let item = new vscode.CompletionItem(body[o].name);
                    item.detail = body[o].context;
                    results.push(item);
                }
                resolve(new vscode.CompletionList(results, false));
            }));
        });
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}