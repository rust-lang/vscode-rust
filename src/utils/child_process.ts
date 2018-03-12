// Copyright 2017 The RLS Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

'use strict';

/**
 *  Ideally, this module should be replaced with `utils.promisefy()` introduced Node.js 8.
 *  But we might not replace these properly if it is not well typed.
 */

import * as child_process from 'child_process';

export interface ExecChildProcessResult<TOut = string> {
    readonly stdout: TOut;
    readonly stderr: TOut;
}

export async function execChildProcess(command: string): Promise<ExecChildProcessResult> {
    const r: Promise<ExecChildProcessResult> = new Promise((resolve, reject) => {
        child_process.exec(command, {
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
    return r;
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