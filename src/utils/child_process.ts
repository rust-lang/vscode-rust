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

export async function run_rustup(rustup: string, args: string[], options: child_process.ExecFileOptions, useWSL?: boolean): Promise<ExecChildProcessResult> {
    let command: string = rustup;

    if (useWSL == true) {
        ({ command: command, args: args } = modifyParametersForWSL(command, args));
    }

    return execFile(command, args, options);
}

export function run_rustup_sync(rustup: string, args: string[], options: child_process.ExecFileOptions, useWSL?: boolean): Buffer {
    let command: string = rustup;

    if (useWSL == true) {
        ({ command: command, args: args } = modifyParametersForWSL(command, args));
    }

    return child_process.execFileSync(command, args, { ...options });
}

export function run_rustup_process(rustup: string, args: string[], options: child_process.ExecFileOptions, useWSL?: boolean): child_process.ChildProcess {
    let command: string = rustup;

    if (useWSL == true) {
        ({ command: command, args: args } = modifyParametersForWSL(command, args));
    }
    
    return child_process.spawn(command, args, options);
}

function modifyParametersForWSL(originalCommand: string, originalArgs: string[]): { command: string, args: string[] } {
    // When using Windows Subsystem for Linux call bash.exe in interactive mode
    // Necessary, because on default rustup path is set in '.profile'
    return {
        command: 'bash.exe',
        args: ['-i', '-c', originalArgs.reduce((p, c) => `${p} ${c}`, originalCommand)]
    };
}
