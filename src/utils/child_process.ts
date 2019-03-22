import * as child_process from 'child_process';
import * as util from 'util';

import { modifyParametersForWSL } from './wslpath';

const execFileAsync = util.promisify(child_process.execFile);

export interface SpawnFunctions {
  execFile: typeof execFileAsync;
  execFileSync: typeof child_process.execFileSync;
  spawn: typeof child_process.spawn;
}

export function withWsl(withWsl: boolean): SpawnFunctions {
  return withWsl
    ? {
        execFile: withWslModifiedParameters(execFileAsync),
        execFileSync: withWslModifiedParameters(child_process.execFileSync),
        spawn: withWslModifiedParameters(child_process.spawn),
      }
    : {
        execFile: execFileAsync,
        execFileSync: child_process.execFileSync,
        spawn: child_process.spawn,
      };
}

function withWslModifiedParameters(
  // tslint:disable-next-line: no-any
  func: (command: string, ...rest: any) => any,
): typeof func {
  // tslint:disable-next-line: no-any
  return (command: string, arg1?: any, ...rest: any) => {
    if (arg1 instanceof Array) {
      ({ command, args: arg1 } = modifyParametersForWSL(command, arg1));
    }

    return func(command, ...[arg1, ...rest]);
  };
}
