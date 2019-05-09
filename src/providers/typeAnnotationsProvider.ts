'use strict';
import * as vscode from 'vscode';
import { LanguageClient, HoverRequest } from 'vscode-languageclient';
import { Position } from 'vscode';

const typeHintDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    color: new vscode.ThemeColor('rust.typeHintColor'),
    backgroundColor: new vscode.ThemeColor('rust.typeHintBackgroundColor'),
  },
});

const MULTIPLE_DECLARATIONS = '(&?(mut\\s+)?\\w+(\\s*:\\s*\\w+)?\\s*,?\\s*)+';
const SIMPLE_DECLARATION = /(let|for)(\s+mut)?\s+(\w+)[ :=]/;
const TUPLE_UNPACKING: RegExp = new RegExp(
  '(let\\s+|for\\s+|if let[^=]+)(\\(' + MULTIPLE_DECLARATIONS + '\\))',
);
const MATCH_CASE: RegExp = new RegExp(
  '\\(' + MULTIPLE_DECLARATIONS + '\\)[)\\s]*=>',
);
const CLOSURE_PARAMETERS: RegExp = new RegExp(
  '\\|' + MULTIPLE_DECLARATIONS + '\\|',
);
const INNER_DECLARATION: RegExp = new RegExp('&?\\s*(mut\\s+)?\\w+');

function unpack_arguments(line: string): number[] {
  let result: number[] = [];
  let args = line.split(',');
  let count = 0;
  for (let arg of args) {
    let inner = arg.match(INNER_DECLARATION);
    if (inner && inner.index !== undefined) {
      result.push(count + inner.index + inner[0].length);
    }
    count += arg.length + 1;
  }
  return result;
}

function get_next_position(
  line_number: number,
  substring: string,
  base_charcount: number,
): Position[] {
  let match = substring.match(SIMPLE_DECLARATION);
  if (match && match.index) {
    return [
      new Position(
        line_number,
        base_charcount + match.index + match[0].length - 1,
      ),
    ];
  }
  let declaration_positions = [];
  let closure_match = substring.match(CLOSURE_PARAMETERS);
  if (closure_match && closure_match.index) {
    for (let character of unpack_arguments(closure_match[0].substr(1))) {
      declaration_positions.push(
        new Position(
          line_number,
          base_charcount + closure_match.index + 1 + character,
        ),
      );
    }
    return declaration_positions;
  }
  let tuple_unpacking = substring.match(TUPLE_UNPACKING);
  if (tuple_unpacking && tuple_unpacking.index) {
    for (let character of unpack_arguments(tuple_unpacking[2].substr(1))) {
      declaration_positions.push(
        new Position(
          line_number,
          base_charcount +
            tuple_unpacking.index +
            tuple_unpacking[1].length +
            1 +
            character,
        ),
      );
    }
    return declaration_positions;
  }
  let match_arm = substring.match(MATCH_CASE);
  if (match_arm && match_arm.index) {
    for (let character of unpack_arguments(match_arm[0].substr(1))) {
      declaration_positions.push(
        new Position(
          line_number,
          base_charcount + match_arm.index + 1 + character,
        ),
      );
    }
  }
  return declaration_positions;
}

export class Decorator {
  private static instance?: Decorator;
  private lc: LanguageClient;

  public constructor(lc: LanguageClient) {
    this.lc = lc;
    Decorator.instance = this;
  }

  public static getInstance(): Decorator | undefined {
    return Decorator.instance;
  }

  public async decorate(editor: vscode.TextEditor) {
    if (!editor.document.uri.toString().endsWith('.rs')) {
      return;
    }
    const text = editor.document.getText();
    const lines = text.split('\n');
    const declarationPositions: Position[] = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].split('//')[0];
      if (line.trim().startsWith('impl')) {
        continue;
      }
      let newPositions: Position[] = [];
      let count = 0;
      do {
        newPositions = get_next_position(i, line, count);
        for (const position of newPositions) {
          declarationPositions.push(position);
        }
        const last = newPositions[newPositions.length - 1];
        if (last) {
          line = line.substr(last.character);
          count += last.character;
        }
      } while (newPositions.length > 0);
    }
    const hints: vscode.DecorationOptions[] = [];
    for (const position of declarationPositions) {
      const hover = await this.lc.sendRequest(
        HoverRequest.type,
        this.lc.code2ProtocolConverter.asTextDocumentPositionParams(
          editor.document,
          position.translate(0, -1),
        ),
      );
      if (hover) {
        let hint = ': ';
        const content = hover.contents;
        try {
          // @ts-ignore
          hint += content[0].value;
        } catch (e) {}
        hints.push({
          range: new vscode.Range(position, position),
          renderOptions: { after: { contentText: hint } },
        });
      }
    }
    editor.setDecorations(typeHintDecorationType, hints);
  }
}
