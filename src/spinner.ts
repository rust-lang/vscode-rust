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

import { window } from 'vscode';

export function startSpinner(prefix: string, postfix: string) {
    if (spinnerTimer != null) {
        clearInterval(spinnerTimer);
    }
    let state = 0;
    spinnerTimer = setInterval(function() {
        window.setStatusBarMessage(prefix + ' ' + spinner[state] + ' ' + postfix);
        state = (state + 1) % spinner.length;
    }, 100);
}

export function stopSpinner(message: string) {
    if (spinnerTimer !== null) {
        clearInterval(spinnerTimer);
    }
    spinnerTimer = null;

    window.setStatusBarMessage(message);
}

let spinnerTimer: NodeJS.Timer | null = null;
const spinner = ['◐', '◓', '◑', '◒'];
