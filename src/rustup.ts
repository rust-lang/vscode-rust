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
import { window, workspace } from 'vscode';

import { execChildProcess } from './utils/child_process';
import { startSpinner, stopSpinner } from './spinner';
import { CONFIGURATION } from './extension';

// This module handles running the RLS via rustup, including checking that rustup
// is installed and installing any required components/toolchains.

export async function runRlsViaRustup(env: any): Promise<child_process.ChildProcess> {
    await ensureToolchain();
    await checkForRls();
    return child_process.spawn(CONFIGURATION.rustupPath, ['run', CONFIGURATION.channel, 'rls'], { env });
}

export async function rustupUpdate() {
    startSpinner('RLS', 'Updating…');

    try {
        const { stdout } = await execChildProcess(CONFIGURATION.rustupPath + ' update');
        // This test is imperfect because if the user has multiple toolchains installed, they
        // might have one updated and one unchanged. But I don't want to go too far down the
        // rabbit hole of parsing rustup's output.
        if (stdout.indexOf('unchanged') > -1) {
            stopSpinner('Up to date.');
        } else {
            stopSpinner('Up to date. Restart extension for changes to take effect.');
        }
    } catch (e) {
        console.log(e);
        stopSpinner('An error occurred whilst trying to update.');
    }
}

// Check for the nightly toolchain (and that rustup exists)
async function ensureToolchain(): Promise<void> {
    const toolchainInstalled = await hasToolchain();
    if (toolchainInstalled) {
        return;
    }

    const clicked = await window.showInformationMessage(CONFIGURATION.channel + ' toolchain not installed. Install?', 'Yes');
    if (clicked === 'Yes') {
        await tryToInstallToolchain();
    }
    else {
        throw new Error();
    }
}

async function hasToolchain(): Promise<boolean> {
    try {
        const { stdout } = await execChildProcess(CONFIGURATION.rustupPath + ' toolchain list');
        const hasToolchain = stdout.indexOf(CONFIGURATION.channel) > -1;
        return hasToolchain;
    }
    catch (e) {
        console.log(e);
        // rustup not present
        window.showErrorMessage('Rustup not available. Install from https://www.rustup.rs/');
        throw e;
    }
}

async function tryToInstallToolchain(): Promise<void> {
    startSpinner('RLS', 'Installing toolchain…');
    try {
        const { stdout, stderr } = await execChildProcess(CONFIGURATION.rustupPath + ' toolchain install ' + CONFIGURATION.channel);
        console.log(stdout);
        console.log(stderr);
        stopSpinner(CONFIGURATION.channel + ' toolchain installed successfully');
    }
    catch (e) {
        console.log(e);
        window.showErrorMessage('Could not install ' + CONFIGURATION.channel + ' toolchain');
        stopSpinner('Could not install ' + CONFIGURATION.channel + ' toolchain');
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
        const { stdout } = await execChildProcess(CONFIGURATION.rustupPath + ' component list --toolchain ' + CONFIGURATION.channel);
        const componentName = new RegExp('^' + CONFIGURATION.componentName + '.* \\((default|installed)\\)$', 'm');
        if (
            stdout.search(componentName) === -1 ||
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
    startSpinner('RLS', 'Installing components…');

    const tryFn: (component: string) => Promise<(Error | null)> = async (component: string) => {
        try {
            const { stdout, stderr, } = await execChildProcess(CONFIGURATION.rustupPath + ` component add ${component} --toolchain ` + CONFIGURATION.channel);
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
        const e = await tryFn('rust-analysis');
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
        const e = await tryFn(CONFIGURATION.componentName);
        if (e !== null) {
            stopSpinner('Could not install RLS');
            throw e;
        }
    }

    stopSpinner('RLS components installed successfully');
}

/**
 * Parses given output of `rustup show` and retrieves the local active toolchain.
 */
export function parseActiveToolchain(rustupOutput: string): string {
    // There may a default entry under 'installed toolchains' section, so search
    // for currently active/overridden one only under 'active toolchain' section
    const activeToolchainsIndex = rustupOutput.search('active toolchain');
    if (activeToolchainsIndex === -1) {
        throw new Error(`couldn't find active toolchains`);
    }

    rustupOutput = rustupOutput.substr(activeToolchainsIndex);

    const matchActiveChannel = new RegExp(/^(\S*) \((?:default|overridden)/gm);
    const match = matchActiveChannel.exec(rustupOutput);
    if (match === null) {
        throw new Error(`couldn't find active toolchain under 'active toolchains'`);
    } else if (match.length > 2) {
        throw new Error(`multiple active toolchains found under 'active toolchains'`);
    }

    return match[1];
}

/**
 * Returns active (including local overrides) toolchain, as specified by rustup.
 * May throw if rustup at specified path can't be executed.
 */
export function getActiveChannel(rustupPath: string, cwd = workspace.rootPath): string {
    // rustup info might differ depending on where it's executed
    // (e.g. when a toolchain is locally overriden), so executing it
    // under our current workspace root should give us close enough result
    const output = child_process.execSync(`${rustupPath} show`, { cwd: cwd }).toString();

    const activeChannel = parseActiveToolchain(output);
    console.info(`Detected active channel: ${activeChannel} (since 'rust-client.channel' is unspecified)`);
    return activeChannel;
}
