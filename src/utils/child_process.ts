/**
 *  Ideally, this module should be replaced with `utils.promisefy()` introduced Node.js 8.
 *  But we might not replace these properly if it is not well typed.
 */

import * as child_process from 'child_process';

export interface ExecChildProcessResult<TOut = string> {
    readonly stdout: TOut;
    readonly stderr: TOut;
}

export async function execFile(command: string, args: string[], options: child_process.ExecFileOptions): Promise<ExecChildProcessResult> {
    return new Promise<ExecChildProcessResult>((resolve, reject) => {
        child_process.execFile(command, args, {
            ...options,
            encoding: 'utf8',
        }, (error, stdout, stderr) => {
            if (!!error) {
                reject(error);
                return;
            }

            resolve({
                stdout,
                stderr,
            });
        });

    });
}