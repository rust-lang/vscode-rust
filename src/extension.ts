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
    vscode.languages.registerDefinitionProvider('rust', new RustDefProvider());
    vscode.languages.registerReferenceProvider('rust', new RustRefProvider());
    vscode.languages.registerRenameProvider('rust', new RustRenameProvider());
    vscode.languages.registerDocumentHighlightProvider('rust', new RustHighlightProvider());
    vscode.languages.registerDocumentSymbolProvider('rust', new RustSymbolProvider());

    diagnosticCollection = vscode.languages.createDiagnosticCollection('rust');
    context.subscriptions.push(diagnosticCollection);

    vscode.workspace.onDidSaveTextDocument(onSave);
    vscode.workspace.onDidChangeTextDocument(onChange);
    vscode.workspace.onDidOpenTextDocument(onSave);
    vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor) => onSave(editor.document));
    // TODO when we open, we do a build get the diagnostics in their window, but don't underline stuff
}

function onSave(document: vscode.TextDocument) {
    console.log("building...");
    vscode.window.setStatusBarMessage("Analysis: in progress");
    request({
        url: rls_url + "on_save",
        method: "POST",
        json: true,
        body: build_save_input(document)
    }, function(err, res, body) {
        receiveBuildStatus(body, document)
    });
}

function onChange(event: vscode.TextDocumentChangeEvent) {
    console.log("building...");
    vscode.window.setStatusBarMessage("Analysis: in progress");
    request({
        url: rls_url + "on_change",
        method: "POST",
        json: true,
        body: build_change_input(event)
    }, function(err, res, body) {
        receiveBuildStatus(body, event.document)
    });
}

function receiveBuildStatus(body, document) {
    function underline_diagnostic(obj, severity) {
        let diags = [];
        let msg_matches_filename = false;
        let prepend = "";
        if (severity == vscode.DiagnosticSeverity.Warning) {
            prepend = "[warning] ";
        }
        else if (severity == vscode.DiagnosticSeverity.Error) {
            prepend = "[error] ";
        }
        for (let idx in obj) {
            let msg = JSON.parse(obj[idx]);
            if (msg.spans && msg.spans.length > 0) {
                let diag = new vscode.Diagnostic(
                    new vscode.Range(
                        new vscode.Position(msg.spans[0].line_start-1, msg.spans[0].column_start-1),
                        new vscode.Position(msg.spans[0].line_end-1, msg.spans[0].column_end-1)
                    ),
                    prepend + (msg.spans[0].label ? msg.spans[0].label : msg.message),
                    severity);
                if (document.uri.path.search(msg.spans[0].file_name)) {
                    diags.push(diag);
                    msg_matches_filename = true;
                }
            }
        }
        if (msg_matches_filename) {
            diagnosticCollection.set(document.uri, diags);
        }
    }

    if (body) {
        console.log(body);
        if (body.Failure) {
            vscode.window.setStatusBarMessage("Analysis: done");
            diagnosticCollection.clear();
            try {
                underline_diagnostic(body.Failure, vscode.DiagnosticSeverity.Error);
            }
            catch (e) {
                vscode.window.setStatusBarMessage("Analysis: bad JSON response");
                console.log(e);
            }
        } else if (body.Success) {
            vscode.window.setStatusBarMessage("Analysis: done");
            diagnosticCollection.clear();
            try {
                underline_diagnostic(body.Success, vscode.DiagnosticSeverity.Warning);
            }
            catch (e) {
                //console.log("Cannot parse: " + body.Failure);
                vscode.window.setStatusBarMessage("Analysis: bad JSON response");
                console.log(e);
            }
        }
    }
    else {
        vscode.window.setStatusBarMessage("Analysis: RLS offline");
    }
}

class RustTypeHoverProvider implements vscode.HoverProvider {
    public provideHover(document: vscode.TextDocument,
                        position: vscode.Position,
                        token: vscode.CancellationToken): Promise<vscode.Hover> {
        return new Promise<vscode.Hover>((resolve, reject) => {
            request({
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
            });
        });
    }
}

// TODO should these be different providers? Means we make redundent calls and also don't control layout of tool tip.
class RustDocHoverProvider implements vscode.HoverProvider {
    public provideHover(document: vscode.TextDocument,
                        position: vscode.Position,
                        token: vscode.CancellationToken): Promise<vscode.Hover> {
        return new Promise<vscode.Hover>((resolve, reject) => {
            request({
                url: rls_url + "title",
                method: "POST",
                json: true,
                body: build_input_pos(document, position)
            }, function(err, res, body) {
                if (body) {
                    let docs: string = body.docs;
                    if (body.docs) {
                        // TODO I don't think we need this, since we only provide opening para of docs.
                        docs = (<string>body.docs).replace(/\* /g, "\\* ");
                        let doc_lines = docs.split("\n");
                        docs = doc_lines.map(Function.prototype.call, String.prototype.trim).join("\n");

                        if (body.doc_url) {
                            docs += "\n[...](" + body.doc_url + ")";
                        }
                        resolve(new vscode.Hover(docs));
                    } else {
                        // It is possible we don't have doc string, but the doc_url is valid, we might display it somehow
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            });
        });
    }
}

class RustCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position,
        token: vscode.CancellationToken): Promise<vscode.CompletionList> {
        return new Promise<vscode.CompletionList>((resolve, reject) => {
            document.save().then(() => request({
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
                }
                resolve(new vscode.CompletionList(results, false));
            }));
        });
    }
}

class RustSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SymbolInformation[]> {
        return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
            request({
                    url: rls_url + "symbols",
                    method: "POST",
                    json: true,
                    body: document.fileName
            }, function(err, res, body) {
                if (body) {
                    resolve(body.map((s) => {
                        return new vscode.SymbolInformation(s.name, s.kind, range_from_span(s.span), document.uri);
                    }))
                }
            });
        });
    }
}

class RustDefProvider implements vscode.DefinitionProvider {
    public provideDefinition(document: vscode.TextDocument,
                             position: vscode.Position,
                             token: vscode.CancellationToken): Promise<vscode.Definition> {
        return new Promise<vscode.Definition>((resolve, reject) => {
            request({
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
            });
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
            request({
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
            });
        });
    }
}

class RustRenameProvider implements vscode.RenameProvider {
    public provideRenameEdits(document: vscode.TextDocument,
                              position: vscode.Position,
                              newName: String,
                              token: vscode.CancellationToken): Promise<vscode.WorkspaceEdit> {
        return new Promise<vscode.WorkspaceEdit>((resolve, reject) => {
            request({
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
            });
        });
    }
}

class RustHighlightProvider implements vscode.DocumentHighlightProvider {
    public provideDocumentHighlights(document: vscode.TextDocument,
                                     position: vscode.Position,
                                     token: vscode.CancellationToken): Promise<vscode.DocumentHighlight[]> {
        return new Promise<vscode.DocumentHighlight[]>((resolve, reject) => {
            request({
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
            });
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
function build_save_input(document: vscode.TextDocument): string {
    return JSON.stringify({
        project_path: vscode.workspace.rootPath,
        saved_file: document.fileName 
    });
}

function build_change_input(event: vscode.TextDocumentChangeEvent): string {
    return JSON.stringify({
        project_path: vscode.workspace.rootPath,
        changes: event.contentChanges.map((cc) => {
            return {
                span: {
                    file_name: event.document.fileName,
                    line_start: cc.range.start.line,
                    column_start: cc.range.start.character,
                    line_end: cc.range.end.line,
                    column_end: cc.range.end.character
                },
                text: cc.text
            };
        })
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
}
