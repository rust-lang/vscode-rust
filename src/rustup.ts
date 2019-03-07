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

import { execFile, ExecChildProcessResult } from './utils/child_process';

import { startSpinner, stopSpinner } from './spinner';

export class RustupConfig {
    channel: string;
    path: string;
    useWSL: boolean;

    constructor(channel: string, path: string, useWSL: boolean) {
        this.channel = channel;
        this.path = path;
        this.useWSL = useWSL;
    }
}

// This module handles running the RLS via rustup, including checking that rustup
// is installed and installing any required components/toolchains.

export async function rustupUpdate(config: RustupConfig) {
    startSpinner('RLS', 'Updating…');

    try {
        const { stdout } = await execCmd(config.path, ['update'], {}, config.useWSL);

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
export async function ensureToolchain(config: RustupConfig): Promise<void> {
    const toolchainInstalled = await hasToolchain(config);
    if (toolchainInstalled) {
        return;
    }

    const clicked = await window.showInformationMessage(config.channel + ' toolchain not installed. Install?', 'Yes');
    if (clicked === 'Yes') {
        await tryToInstallToolchain(config);
    }
    else {
        throw new Error();
    }
}

// Check for rls components.
export async function checkForRls(config: RustupConfig): Promise<void> {
    const hasRls = await hasRlsComponents(config);
    if (hasRls) {
        return;
    }

    // missing component
    const clicked = await Promise.resolve(window.showInformationMessage('RLS not installed. Install?', 'Yes'));
    if (clicked === 'Yes') {
        await installRls(config);
    }
    else {
        throw new Error();
    }
}

async function hasToolchain(config: RustupConfig): Promise<boolean> {
    try {
        const { stdout } = await execCmd(config.path, ['toolchain', 'list'], {}, config.useWSL);
        const hasToolchain = stdout.indexOf(config.channel) > -1;
        return hasToolchain;
    }
    catch (e) {
        console.log(e);
        // rustup not present
        window.showErrorMessage('Rustup not available. Install from https://www.rustup.rs/');
        throw e;
    }
}

async function tryToInstallToolchain(config: RustupConfig): Promise<void> {
    startSpinner('RLS', 'Installing toolchain…');
    try {
        const { stdout, stderr } = await execCmd(config.path, ['toolchain', 'install', config.channel], {}, config.useWSL);
        console.log(stdout);
        console.log(stderr);
        stopSpinner(config.channel + ' toolchain installed successfully');
    }
    catch (e) {
        console.log(e);
        window.showErrorMessage('Could not install ' + config.channel + ' toolchain');
        stopSpinner('Could not install ' + config.channel + ' toolchain');
        throw e;
    }
}

async function hasRlsComponents(config: RustupConfig): Promise<boolean> {
    try {
        const { stdout } = await execCmd(config.path, ['component', 'list', '--toolchain', config.channel], {}, config.useWSL);
        const componentName = new RegExp('^rls.* \\((default|installed)\\)$', 'm');

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

async function installRls(config: RustupConfig): Promise<void> {
    startSpinner('RLS', 'Installing components…');

    const tryFn: (component: string) => Promise<(Error | null)> = async (component: string) => {
        try {
            const { stdout, stderr } = await execCmd(config.path, ['component', 'add', component, '--toolchain', config.channel], {}, config.useWSL);
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
        const e = await tryFn('rls-preview');
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
    if (activeToolchainsIndex !== -1) {
        rustupOutput = rustupOutput.substr(activeToolchainsIndex);

        const matchActiveChannel = /^(\S*) \((?:default|overridden)/gm;
        const match = matchActiveChannel.exec(rustupOutput);
        if (match === null) {
            throw new Error(`couldn't find active toolchain under 'active toolchains'`);
        } else if (matchActiveChannel.exec(rustupOutput) !== null) {
            throw new Error(`multiple active toolchains found under 'active toolchains'`);
        }

        return match[1];
    }

    // Try matching the third line as the active toolchain
    const match = /^(?:.*\r?\n){2}(\S*) \((?:default|overridden)/.exec(rustupOutput);
    if (match !== null) {
        return match[1];
    }

    throw new Error(`couldn't find active toolchains`);
}

/**
 * Returns active (including local overrides) toolchain, as specified by rustup.
 * May throw if rustup at specified path can't be executed.
 */
export function getActiveChannel(wsPath: string, config: RustupConfig): string {
    // rustup info might differ depending on where it's executed
    // (e.g. when a toolchain is locally overriden), so executing it
    // under our current workspace root should give us close enough result

    let activeChannel;
    try {
        // `rustup show active-toolchain` is available since rustup 1.12.0
        activeChannel = execCmdSync(config.path, ['show', 'active-toolchain'], { cwd: wsPath }, config.useWSL).toString().trim();
        // Since rustup 1.17.0 if the active toolchain is the default, we're told
        // by means of a " (default)" suffix, so strip that off if it's present
        // If on the other hand there's an override active, we'll get an
        // " (overridden by ...)" message instead.
        activeChannel = activeChannel.replace(/ \(.*\)$/, '');
    } catch (e) {
        // Possibly an old rustup version, so try rustup show
        const showOutput = execCmdSync(config.path, ['show'], { cwd: wsPath }, config.useWSL).toString();
        activeChannel = parseActiveToolchain(showOutput);
    }

    console.info(`Detected active channel: ${activeChannel} (since 'rust-client.channel' is unspecified)`);
    return activeChannel;
}

export async function execCmd(rustup: string, args: string[], options: child_process.ExecFileOptions, useWSL?: boolean): Promise<ExecChildProcessResult> {
    if (useWSL) {
        ({ rustup, args } = modifyParametersForWSL(rustup, args));
    }

    return execFile(rustup, args, options);
}

export function execCmdSync(rustup: string, args: string[], options: child_process.ExecFileOptions, useWSL?: boolean): Buffer {
    if (useWSL) {
        ({ rustup, args } = modifyParametersForWSL(rustup, args));
    }

    return child_process.execFileSync(rustup, args, { ...options });
}

export function spawnProcess(rustup: string, args: string[], options: child_process.ExecFileOptions, useWSL?: boolean): child_process.ChildProcess {
    if (useWSL) {
        ({ rustup, args } = modifyParametersForWSL(rustup, args));
    }

    return child_process.spawn(rustup, args, options);
}

function modifyParametersForWSL(command: string, args: string[]) {
    args.unshift(command);
    return {
        rustup: 'wsl',
        args: args
    };
}