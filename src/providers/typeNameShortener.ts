function splitSingleBracketLevel(
  str: string,
  brackets: string = '{}',
  delimiter = ',',
  level = 1,
): string[] {
  const result: string[] = [];
  const bracketStart = brackets[0];
  const bracketEnd = brackets[brackets.length - 1];
  let count = 0;
  let latestDelimiter = 0;
  for (let i = 0; i < str.length; i++) {
    switch (str[i]) {
      case bracketStart:
        count++;
        if (count === level) {
          latestDelimiter = i + 1;
        }
        break;
      case bracketEnd:
        count--;
        if (count === level - 1) {
          result.push(str.substring(latestDelimiter, i));
          latestDelimiter = i + 1;
          return result;
        }
        break;
      case delimiter:
        if (count === level) {
          result.push(str.substring(latestDelimiter, i));
          latestDelimiter = i + 1;
        }
        break;
      case '[':
        count++;
        break;
      case ']':
        count--;
    }
  }
  const end = str.substring(latestDelimiter);
  if (end.length > 0) {
    result.push(end);
  }
  return result;
}

function getPostFix(str: string, brackets = '<>'): string {
  let count = 0;
  const bracketStart = brackets[0];
  const bracketEnd = brackets[brackets.length - 1];
  for (let i = 0; i < str.length; i++) {
    switch (str[i]) {
      case bracketStart:
        count++;
        break;
      case bracketEnd:
        count--;
        if (count === 0) {
          return str.substring(i + 1);
        }
        break;
    }
  }
  return '';
}

class SemiFullType {
  public prefix: string;
  public postfix: string;
  public children: FullType[];
  public constructor(
    prefix: string,
    postfix: string,
    children: FullType[] = [],
  ) {
    this.prefix = prefix;
    this.postfix = postfix;
    this.children = children;
  }

  public stringify(): string {
    return (
      this.prefix +
      (this.children.length === 0
        ? ''
        : '<' +
          this.children.map(child => child.stringify()).join(', ') +
          '>') +
      this.postfix
    );
  }
}

// tslint:disable-next-line: max-classes-per-file
export class FullType {
  public parts: SemiFullType[] = [];

  public constructor(parseable: string) {
    if (parseable === '') {
      return;
    }
    const typeParts = splitSingleBracketLevel(parseable, '<>', '+', 0);
    for (const typePart of typeParts) {
      let index: number | undefined = typePart.indexOf('<');
      index = index < 0 ? undefined : index;
      const prefix = typePart.substring(0, index);
      const args = index !== undefined ? typePart.substring(index) : '';
      const postfix = getPostFix(args);
      const part: SemiFullType = new SemiFullType(prefix.trim(), postfix);
      const childrenStr = splitSingleBracketLevel(args, '<>');
      for (let childStr of childrenStr) {
        if (childStr.trim().startsWith('[closure@')) {
          childStr = '[closure]';
        }
        part.children.push(new FullType(childStr));
      }
      this.parts.push(part);
    }
  }

  public stringify(): string {
    return this.parts.map(part => part.stringify()).join(' + ');
  }
}

// tslint:disable-next-line: max-classes-per-file
export class GreedySimplifier {
  protected static prefixRegex: RegExp = /(&(mut)?\s*)/;

  public static simplify(fullType: FullType): FullType {
    const returnValue: FullType = new FullType('');
    for (const part of fullType.parts) {
      if (part.prefix.startsWith("'")) {
        continue;
      }
      const prefixOption = part.prefix.match(GreedySimplifier.prefixRegex);
      const prefix = prefixOption !== null ? prefixOption[0] : '';
      const nameSplit = part.prefix.substring(prefix.length).split('::');
      const semiType: SemiFullType = new SemiFullType(
        prefix +
          (part.prefix.includes(' as ')
            ? part.prefix.split(' as ')[0] + ' as '
            : '') +
          nameSplit[nameSplit.length - 1],
        part.postfix,
      );
      for (const subType of part.children) {
        const simplifiedSubType = this.simplify(subType);
        if (simplifiedSubType.parts.length > 0) {
          semiType.children.push(simplifiedSubType);
        }
      }
      returnValue.parts.push(semiType);
    }
    return returnValue;
  }
}
