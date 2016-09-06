'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import http = require('http');
import request = require('request');

let rls_url = "http://127.0.0.1:9000/";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // TODO disposables?
    vscode.languages.registerHoverProvider('rust', new RustHoverProvider());
    vscode.languages.registerCompletionItemProvider('rust', new RustCompletionProvider(), ".");
    vscode.languages.registerDefinitionProvider('rust', new RustDefProvider);
    vscode.languages.registerReferenceProvider('rust', new RustRefProvider);
    vscode.workspace.onDidChangeTextDocument(onChange);
}

let changeTimeout = null;

// TODO jntrnr: please sanity check these promises
function checkTimeout(document: vscode.TextDocument): Promise<boolean> {
    if (changeTimeout) {
        clearTimeout(changeTimeout);
        changeTimeout = null;
        return save(document);
    }
    
    return Promise.resolve(true);
}

function save(document: vscode.TextDocument): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        document.save().then(() => request({
            url: rls_url + "on_change",
            method: "POST",
            json: true,
            body: ''
        }));
        resolve(true);
    });
}

function onChange(event: vscode.TextDocumentChangeEvent) {
    if (changeTimeout) {
        clearTimeout(changeTimeout);
        changeTimeout = null;
    }

    changeTimeout = setTimeout(() => {
        save(event.document).then(() => {
            changeTimeout = null;
        });
    }, 1000);
}

class RustHoverProvider implements vscode.HoverProvider {
    public provideHover(document: vscode.TextDocument,
                        position: vscode.Position,
                        token: vscode.CancellationToken): Promise<vscode.Hover> {
        return new Promise<vscode.Hover>((resolve, reject) => {
            checkTimeout(document).then(() => request({
                url: rls_url + "title",
                method: "POST",
                json: true,
                body: build_input_pos(document, position)
            }, function(err, res, body) {
                if (body) {
                    resolve(new vscode.Hover(body));
                } else {
                    resolve(null);
                }
            }));
        });
    }
}

class RustCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position,
        token: vscode.CancellationToken): Promise<vscode.CompletionList> {
        return new Promise<vscode.CompletionList>((resolve, reject) => {
            checkTimeout(document).then(() => request({
                url: rls_url + "complete",
                method: "POST",
                json: true,
                body: build_input_pos(document, position)
            }, function(err, res, body) {
                let results = [];
                for (let o in body) {
                    let item = new vscode.CompletionItem(body[o].name);
                    item.detail = body[o].context;
                    results.push(item);
                    console.log("complete: " + item)
                }
                resolve(new vscode.CompletionList(results, false));
            }));
        });
    }
}

class RustDefProvider implements vscode.DefinitionProvider {
    public provideDefinition(document: vscode.TextDocument,
                             position: vscode.Position,
                             token: vscode.CancellationToken): Promise<vscode.Definition> {
        return new Promise<vscode.Definition>((resolve, reject) => {
            checkTimeout(document).then(() => request({
                url: rls_url + "goto_def",
                method: "POST",
                json: true,
                body: build_input_pos(document, position)
            }, function(err, res, body) {
                if (body.Err) {
                    console.log("Error resolving definition");
                    resolve(null);
                    return;
                }

                console.log("Def provider: " + body.Ok[1]);
                let span = body.Ok[0];
                resolve(new vscode.Location(uri_from_span(span), pos_from_span(span)));
            }));
        });
        
    }
}

class RustRefProvider implements vscode.ReferenceProvider {
    public provideReferences(document: vscode.TextDocument,
                             position: vscode.Position,
                             context: vscode.ReferenceContext,
                             token: vscode.CancellationToken): Promise<vscode.Location[]> {
        return new Promise<vscode.Definition>((resolve, reject) => {
            checkTimeout(document).then(() => request({
                url: rls_url + "find_refs",
                method: "POST",
                json: true,
                body: build_input_pos(document, position)
            }, function(err, res, body) {
                // TODO use map
                let results = [];
                for (let r of body) {
                    console.log("ref: " + r)
                    results.push(pos_from_span(r));
                }
                resolve(results);
            }));
        });
        
    }
}
function uri_from_span(span): vscode.Uri {
    return vscode.Uri.file(span.filepath);
}

function pos_from_span(span): vscode.Position {
    return new vscode.Position(span.line - 1, span.col);
}

function build_input_pos(document: vscode.TextDocument, position: vscode.Position): string {
    let range = document.getWordRangeAtPosition(position);
    if (range) {
        // TODO doing some adjustment here and some in rustls, it should be in one place
        return JSON.stringify({
            pos: {
                filepath: document.fileName,
                line: position.line + 1,
                col: position.character
            },
            span: {
                file_name: document.fileName,
                line_start: range.start.line + 1,
                column_start: range.start.character,
                line_end: range.end.line + 1,
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

// this method is called when your extension is deactivated
export function deactivate() {
}