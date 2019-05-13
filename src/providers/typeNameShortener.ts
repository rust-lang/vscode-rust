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
    }
  }
  const end = str.substring(latestDelimiter);
  if (end.length > 0) {
    result.push(end);
  }
  return result;
}

class SemiFullType {
  public name: string;
  public children: FullType[];
  public constructor(name: string, children: FullType[] = []) {
    this.name = name;
    this.children = children;
  }

  public stringify(): string {
    return (
      this.name +
      (this.children.length === 0
        ? ''
        : '<' + this.children.map(child => child.stringify()).join(', ') + '>')
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
      const part: SemiFullType = new SemiFullType(prefix.trim());
      const childrenStr = splitSingleBracketLevel(args, '<>');
      for (const childStr of childrenStr) {
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
      if (part.name.startsWith("'")) {
        continue;
      }
      const prefixOption = part.name.match(GreedySimplifier.prefixRegex);
      const prefix = prefixOption !== null ? prefixOption[0] : '';
      const nameSplit = part.name.substring(prefix.length).split('::');
      const semiType: SemiFullType = new SemiFullType(
        prefix + nameSplit[nameSplit.length - 1],
      );
      for (const subType of part.children) {
        semiType.children.push(this.simplify(subType));
      }
      returnValue.parts.push(semiType);
    }
    return returnValue;
  }
}
