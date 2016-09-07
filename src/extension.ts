'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import http = require('http');
import request = require('request');

let rls_url = "http://127.0.0.1:9000/";

let diagnosticCollection: vscode.DiagnosticCollection;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // TODO disposables?
    vscode.languages.registerHoverProvider('rust', new RustTypeHoverProvider());
    vscode.languages.registerHoverProvider('rust', new RustDocHoverProvider());
    vscode.languages.registerCompletionItemProvider('rust', new RustCompletionProvider(), ".");
    vscode.languages.registerDefinitionProvider('rust', new RustDefProvider);
    vscode.languages.registerReferenceProvider('rust', new RustRefProvider);
    vscode.languages.registerRenameProvider('rust', new RustRenameProvider);
    vscode.languages.registerDocumentHighlightProvider('rust', new RustHighlightProvider);

    diagnosticCollection = vscode.languages.createDiagnosticCollection('rust');
    context.subscriptions.push(diagnosticCollection);

    vscode.workspace.onDidSaveTextDocument(doc => onChange(doc));
    vscode.workspace.onDidChangeTextDocument(e => onChange(e.document));
    vscode.workspace.onDidOpenTextDocument(doc => onChange(doc));
    vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor) => onChange(editor.document));
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
        vscode.window.setStatusBarMessage("Analysis: in progress");
        document.save().then(() => request({
            url: rls_url + "on_change",
            method: "POST",
            json: true,
            body: ''
        }, function(err, res, body) {
            vscode.window.setStatusBarMessage("Analysis: done");
            diagnosticCollection.clear();
            if (body.Failure) {
                try {
                    let failure = JSON.parse(body.Failure);
                    let diag = new vscode.Diagnostic(
                        new vscode.Range(
                            new vscode.Position(failure.spans[0].line_start-1, failure.spans[0].column_start-1),
                            new vscode.Position(failure.spans[0].line_end-1, failure.spans[0].column_end-1)
                        ),
                        failure.message,
                        vscode.DiagnosticSeverity.Error);

                    if (document.uri.path.search(failure.spans[0].file_name) >= 0) {
                        diagnosticCollection.set(document.uri, [diag]);
                    }
                }
                catch (e) {
                    console.log("Cannot parse: " + body.Failure);
                }
            }
        }));
        resolve(true);
    });
}

function onChange(doc: vscode.TextDocument) {
    if (changeTimeout) {
        clearTimeout(changeTimeout);
        changeTimeout = null;
    }

    changeTimeout = setTimeout(() => {
        save(doc).then(() => {
            changeTimeout = null;
        });
    }, 1000);
}

class RustTypeHoverProvider implements vscode.HoverProvider {
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
                    if (body.ty) {
                        resolve(new vscode.Hover({language: "rust", value: body.ty}));
                    } else {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            }));
        });
    }
}

class RustDocHoverProvider implements vscode.HoverProvider {
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
                    let docs = body.docs;
                    if (body.docs) {
                        resolve(new vscode.Hover(docs));
                    } else {
                        resolve(null);
                    }
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
                    //console.log("complete: " + item)
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
                if (!body || body.Err) {
                    console.log("Error resolving definition");
                    resolve(null);
                    return;
                }
                if (body.Ok) {
                    console.log("Def provider: " + body.Ok[1]);
                    let span = body.Ok[0];
                    resolve(new vscode.Location(uri_from_pos(span), pos_from_pos(span)));
                    return;
                }
                resolve(null);
                return;
            }));
        });
    }
}

class RustRefProvider implements vscode.ReferenceProvider {
    public provideReferences(document: vscode.TextDocument,
                             position: vscode.Position,
                             context: vscode.ReferenceContext,
                             token: vscode.CancellationToken): Promise<vscode.Location[]> {
        // TODO we always provide the decl, we should only do this if the context requests it
        return new Promise<vscode.Definition>((resolve, reject) => {
            checkTimeout(document).then(() => request({
                url: rls_url + "find_refs",
                method: "POST",
                json: true,
                body: build_input_pos(document, position)
            }, function(err, res, body) {
                if (body) {
                    resolve(body.map(loc_from_span));
                } else {
                    resolve(null);
                }
            }));
        });
    }
}

class RustRenameProvider implements vscode.RenameProvider {
    public provideRenameEdits(document: vscode.TextDocument,
                              position: vscode.Position,
                              newName: String,
                              token: vscode.CancellationToken): Promise<vscode.WorkspaceEdit> {
        return new Promise<vscode.WorkspaceEdit>((resolve, reject) => {
            checkTimeout(document).then(() => request({
                url: rls_url + "find_refs",
                method: "POST",
                json: true,
                body: build_input_pos(document, position)
            }, function(err, res, body) {
                let newString = newName.toString();
                let edit = new vscode.WorkspaceEdit;
                for (let r of body) {
                    edit.replace(uri_from_span(r), range_from_span(r), newString);
                }
                resolve(edit);
            }));
        });
    }
}

class RustHighlightProvider implements vscode.DocumentHighlightProvider {
    public provideDocumentHighlights(document: vscode.TextDocument,
                                     position: vscode.Position,
                                     token: vscode.CancellationToken): Promise<vscode.DocumentHighlight[]> {
        return new Promise<vscode.DocumentHighlight[]>((resolve, reject) => {
            checkTimeout(document).then(() => request({
                url: rls_url + "find_refs",
                method: "POST",
                json: true,
                body: build_input_pos(document, position)
            }, function(err, res, body) {
                if (body) {
                    resolve(body.map((span) => new vscode.DocumentHighlight(range_from_span(span))));
                } else {
                    resolve(null);
                }
            }));
        });
    }
}

function uri_from_pos(pos): vscode.Uri {
    return vscode.Uri.file(pos.filepath);
}

function uri_from_span(span): vscode.Uri {
    return vscode.Uri.file(span.file_name);
}

function pos_from_pos(pos): vscode.Position {
    return new vscode.Position(pos.line - 1, pos.col);
}

function range_from_span(span): vscode.Range {
    return new vscode.Range(span.line_start - 1, span.column_start, span.line_end - 1, span.column_end);
}

function loc_from_span(span): vscode.Location {
    return new vscode.Location(uri_from_span(span), range_from_span(span));
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
