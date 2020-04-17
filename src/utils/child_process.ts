import * as child_process from 'child_process';
import * as util from 'util';

import { modifyParametersForWSL } from './wslpath';

const execAsync = util.promisify(child_process.exec);
const execFile = util.promisify(child_process.execFile);

export interface SpawnFunctions {
  exec: typeof execAsync;
  execFile: typeof execFile;
  execSync: typeof child_process.execSync;
  spawn: typeof child_process.spawn;
  modifyArgs: (
    command: string,
    args: string[],
  ) => { command: string; args: string[] };
}

export function withWsl(withWsl: boolean): SpawnFunctions {
  return withWsl
    ? {
        exec: withWslModifiedParameters(execAsync),
        execFile: withWslModifiedParameters(execFile),
        execSync: withWslModifiedParameters(child_process.execSync),
        spawn: withWslModifiedParameters(child_process.spawn),
        modifyArgs: modifyParametersForWSL,
      }
    : {
        exec: execAsync,
        execFile,
        execSync: child_process.execSync,
        spawn: child_process.spawn,
        modifyArgs: (command: string, args: string[]) => ({ command, args }),
      };
}

function withWslModifiedParameters(
  // tslint:disable-next-line: no-any
  func: (command: string, arg1?: any, ...rest: any) => any,
): typeof func {
  // tslint:disable-next-line: no-any
  return (command: string, arg1?: any, ...rest: any) => {
    if (arg1 instanceof Array) {
      ({ command, args: arg1 } = modifyParametersForWSL(command, arg1));
    }

    return func(command, ...[arg1, ...rest]);
  };
}
