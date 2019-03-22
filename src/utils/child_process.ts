import * as child_process from 'child_process';
import * as util from 'util';
import { modifyParametersForWSL } from './wslpath';

export const execFile = util.promisify(child_process.execFile);

export async function execCmd(
  command: string,
  args: string[],
  options: child_process.ExecFileOptions,
  useWSL?: boolean,
): ReturnType<typeof execFile> {
  if (useWSL) {
    ({ command, args } = modifyParametersForWSL(command, args));
  }

  return execFile(command, args, options);
}

export function execCmdSync(
  command: string,
  args: string[],
  options: child_process.ExecFileOptions,
  useWSL?: boolean,
): ReturnType<typeof child_process.execFileSync> {
  if (useWSL) {
    ({ command, args } = modifyParametersForWSL(command, args));
  }

  return child_process.execFileSync(command, args, { ...options });
}

export function spawnProcess(
  command: string,
  args: string[],
  options: child_process.ExecFileOptions,
  useWSL?: boolean,
): child_process.ChildProcess {
  if (useWSL) {
    ({ command, args } = modifyParametersForWSL(command, args));
  }

  return child_process.spawn(command, args, options);
}
