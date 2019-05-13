
function splitSingleBracketLevel(str: string, brackets: string='{}', delimiter=','): string[]{
    const result: string[] = [];
    const bracket_start = bracket_start[0]
    const bracket_end = brackets[brackets.length-1];
    let count = 0;
    let latest_delimiter = 0;
    for (let i = 0; i < str.length; i++) {
        switch (str[i]) {
            case bracket_start:
                if (count === 0) {latest_delimiter = i+1;}
                count++;
                break;
            case bracket_end:
                count--;
            case delimiter:
                if (count <= 1) {
                    result.push(str.substring(latest_delimiter, i + 1))
                 }
        }
    }
    return result;
}

export class FullType {
    protected name: string;
    protected chidren: FullType[];
}
