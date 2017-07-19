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

import * as child_process from 'child_process';
import { window } from 'vscode';

import { execChildProcess } from './utils/child_process';
import { startSpinner, stopSpinner } from './spinner';

// This module handles running the RLS via rustup, including checking that rustup
// is installed and installing any required components/toolchains.

export function runRlsViaRustup(): Promise<child_process.ChildProcess> {
    return checkForNightly().then(checkForRls).then(() => child_process.spawn("rustup", ["run", "nightly", "rls"]));
}

// Check for the nightly toolchain (and that rustup exists)
async function checkForNightly(): Promise<void> {
    const hasNightly = await hasNightlyToolchain();
    if (hasNightly) {
        return;
    }

    const clicked = await Promise.resolve(window.showInformationMessage('Nightly toolchain not installed. Install?', 'Yes'));
    if (clicked === 'Yes') {
        await tryToInstallNightlyToolchain();
    }
    else {
        throw new Error();
    }
}

async function hasNightlyToolchain(): Promise<boolean> {
    try {
        const { stdout } = await execChildProcess('rustup toolchain list');
        const hasNightly = stdout.indexOf('nightly') > -1;
        return hasNightly;
    }
    catch (e) {
        console.log(e);
        // rustup not present
        window.showErrorMessage('Rustup not available. Install from https://www.rustup.rs/');
        throw e;
    }
}

async function tryToInstallNightlyToolchain(): Promise<void> {
    startSpinner("Installing nightly toolchain...");
    try {
        const { stdout, stderr } = await execChildProcess('rustup toolchain install nightly');
        console.log(stdout);
        console.log(stderr);
        stopSpinner('Nightly toolchain installed successfully'); 
    }
    catch (e) {
        console.log(e);
        window.showErrorMessage('Could not install nightly toolchain');
        stopSpinner('Could not install nightly toolchain');
        throw e;
    }
}

// Check for rls components.
async function checkForRls(): Promise<void> {
    const hasRls = await hasRlsComponents();
    if (hasRls) {
        return;
    }

    // missing component
    const clicked = await Promise.resolve(window.showInformationMessage('RLS not installed. Install?', 'Yes'));
    if (clicked === 'Yes') {
        await installRls();
    }
    else {
        throw new Error();
    }
}

async function hasRlsComponents(): Promise<boolean> {
    try {
        const { stdout } = await execChildProcess('rustup component list --toolchain nightly');
        if (stdout.search(/^rls.* \((default|installed)\)$/m) === -1 ||
            stdout.search(/^rust-analysis.* \((default|installed)\)$/m) === -1 ||
            stdout.search(/^rust-src.* \((default|installed)\)$/m) === -1) {
            return false;
        }
        else {
            return true;
        }
    }
    catch (e) {
        console.log(e);
        // rustup error?
        window.showErrorMessage('Unexpected error initialising RLS - error running rustup');
        throw e;
    }
}

async function installRls(): Promise<void> {
    startSpinner('Installing RLS components');

    const tryFn: (component: string) => Promise<(Error | null)> = async (component: string) => {
        try {
            const { stdout, stderr, } = await execChildProcess(`rustup component add ${component} --toolchain nightly`);
            console.log(stdout);
            console.log(stderr);
            return null;
        }
        catch (_e) {
            window.showErrorMessage(`Could not install RLS component (${component})`);
            const err = new Error(`installing ${component} failed`);
            return err;
        }
    };

    {
        const e = await tryFn('rust-analysys');
        if (e !== null) {
            stopSpinner('Could not install RLS');
            throw e;
        }
    }

    {
        const e = await tryFn('rust-src');
        if (e !== null) {
            stopSpinner('Could not install RLS');
            throw e;
        }
    }

    console.log('install rls');

    {
        const e = await tryFn('rls');
        if (e !== null) {
            stopSpinner('Could not install RLS');
            throw e;
        }
    }

    stopSpinner('RLS components installed successfully');
}