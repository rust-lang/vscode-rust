import * as vscode from 'vscode';
import { HoverRequest, LanguageClient } from 'vscode-languageclient';
import { FullType, GreedySimplifier } from './typeNameShortener';

const typeHintDecorationType = vscode.window.createTextEditorDecorationType({
  before: {
    color: new vscode.ThemeColor('rust.typeHintColor'),
    backgroundColor: new vscode.ThemeColor('rust.typeHintBackgroundColor'),
  },
});

const MULTIPLE_DECLARATIONS = '(&?(mut\\s+)?\\w+(\\s*:\\s*\\w+)?\\s*,?\\s*)+';
const SIMPLE_DECLARATION = /((let|for)(\s+mut)?\s+(\w+))\s*[=;]/;
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
  const result: number[] = [];
  const args = line.split(',');
  let count = 0;
  for (const arg of args) {
    const inner = arg.match(INNER_DECLARATION);
    if (!arg.includes(':') && inner && inner.index !== undefined) {
      result.push(count + inner.index + inner[0].length);
    }
    count += arg.length + 1;
  }
  return result;
}

function get_next_position(
  lineNumber: number,
  substring: string,
  currentCharCount: number,
): vscode.Position[] {
  const match = substring.match(SIMPLE_DECLARATION);
  if (match && match.index) {
    return [
      new vscode.Position(
        lineNumber,
        currentCharCount + match.index + match[1].length,
      ),
    ];
  }
  const declarationPositions = [];
  const closureMatch = substring.match(CLOSURE_PARAMETERS);
  if (closureMatch && closureMatch.index) {
    for (const character of unpack_arguments(closureMatch[0].substr(1))) {
      declarationPositions.push(
        new vscode.Position(
          lineNumber,
          currentCharCount + closureMatch.index + 1 + character,
        ),
      );
    }
    return declarationPositions;
  }
  const tupleUnpacking = substring.match(TUPLE_UNPACKING);
  if (tupleUnpacking && tupleUnpacking.index) {
    for (const character of unpack_arguments(tupleUnpacking[2].substr(1))) {
      declarationPositions.push(
        new vscode.Position(
          lineNumber,
          currentCharCount +
            tupleUnpacking.index +
            tupleUnpacking[1].length +
            1 +
            character,
        ),
      );
    }
    return declarationPositions;
  }
  if (substring.includes('=>')) {
    const matchArm = substring.match(MATCH_CASE);
    if (matchArm && matchArm.index) {
      for (const character of unpack_arguments(matchArm[0].substr(1))) {
        declarationPositions.push(
          new vscode.Position(
            lineNumber,
            currentCharCount + matchArm.index + 1 + character,
          ),
        );
      }
    }
  }
  return declarationPositions;
}

const SHORTENER_REGEX = /<[^<]*?(<\.\.\.>)?[^<]*?>/;
const ENABLED = vscode.workspace
  .getConfiguration()
  .get<boolean>('rust-type_hints.enabled', true);
const MAX_LENGTH = vscode.workspace
  .getConfiguration()
  .get<number>('rust-type_hints.max_length', 40);
const SHORTENER = vscode.workspace
  .getConfiguration()
  .get<string>('rust-type_hints.shortening', 'greedy');
export class Decorator {
  private static instance?: Decorator;
  private lc: LanguageClient;

  constructor(lc: LanguageClient) {
    this.lc = lc;
  }

  public static getInstance(lc?: LanguageClient): Decorator | undefined {
    if (lc !== undefined) {
      if (Decorator.instance === undefined) {
        Decorator.instance = new Decorator(lc);
      } else {
        if (Decorator.instance) {
          Decorator.instance.lc = lc;
        }
      }
    }
    return Decorator.instance;
  }

  public async decorate(editor: vscode.TextEditor): Promise<void> {
    if (editor.document.languageId !== 'rust' || !ENABLED) {
      return;
    }
    try {
      const text = editor.document.getText();
      const lines = text.split('\n');
      const declarationPositions: vscode.Position[] = [];
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].split('//')[0].split('#')[0];
        if (line.trim().startsWith('impl')) {
          continue;
        }
        let newPositions: vscode.Position[] = [];
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
        try {
          const hover = await this.lc.sendRequest(
            HoverRequest.type,
            this.lc.code2ProtocolConverter.asTextDocumentPositionParams(
              editor.document,
              position.translate(0, -1),
            ),
          );
          if (hover) {
            const content = hover.contents;
            // @ts-ignore
            const simplified = content[0].value;
            if (!/^(?:\w+::)*\w+(?:<.*>)?$/m.test(simplified)) {
              continue;
            }
            const type = new FullType(simplified);
            let hint = '';
            switch (SHORTENER) {
              case 'none':
                hint = type.stringify();
                break;
              case 'greedy':
                hint = GreedySimplifier.simplify(type).stringify();
                break;
            }
            while (hint.length > MAX_LENGTH) {
              const replacement = hint.replace(SHORTENER_REGEX, '<...>');
              if (replacement === hint) {
                break;
              }
              hint = replacement;
            }
            hints.push({
              range: new vscode.Range(position, position),
              renderOptions: { before: { contentText: ': ' + hint } },
            });
          }
        } catch (e) {
          continue;
        }
      }
      editor.setDecorations(typeHintDecorationType, hints);
    } catch (e) {
      return;
    }
  }
}
