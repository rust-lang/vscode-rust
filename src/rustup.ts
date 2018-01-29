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
import * as https from 'https';

import { execChildProcess } from './utils/child_process';
import { startSpinner, stopSpinner } from './spinner';
import { CONFIGURATION } from './extension';

// This module handles running the RLS via rustup, including checking that rustup
// is installed and installing any required components/toolchains.

export function runRlsViaRustup(env: any): Promise<child_process.ChildProcess> {
    return ensureToolchain().then(checkForRls).then((channel) => child_process.spawn(CONFIGURATION.rustupPath, ['run', channel, 'rls'], { env }));
}

export async function rustupUpdate() {
    startSpinner('Updating RLS...');

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

    const clicked = await Promise.resolve(window.showInformationMessage(CONFIGURATION.channel + ' toolchain not installed. Install?', 'Yes'));
    if (clicked === 'Yes') {
        await tryToInstallToolchain(CONFIGURATION.channel);
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

async function tryToInstallToolchain(channel: string): Promise<void> {
    startSpinner('Installing toolchain...');
    try {
        const { stdout, stderr } = await execChildProcess(CONFIGURATION.rustupPath + ' toolchain install ' + channel);
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
async function checkForRls(): Promise<string> {
    const hasRls = await hasRlsComponents();
    if (hasRls) {
        return CONFIGURATION.channel;
    }

    // missing component
    const clicked = await Promise.resolve(window.showInformationMessage('RLS not installed on configured channel. Install?', 'Yes'));
    if (clicked === 'Yes') {
        return await installRls();
    }
    else {
        throw new Error();
    }
}

async function findLatestRlsVerion(date: Date): Promise<string> {
    const request: Promise<string> = new Promise((resolve, reject) => {
        const dateString = date.toISOString().split('T')[0];
        const url = `https://static.rust-lang.org/dist/${dateString}/channel-rust-nightly.toml`;
        console.log('Sending request on ' + url);
        https.get(url, res => {
            res.setEncoding('utf8');
            let body = '';
            res.on('data', data => {
                body += data;
                if (body.includes('rls-preview')) {
                    resolve(dateString);
                }
            });
            res.on('end', () => {
                reject(new Error('RLS not found on channel: nightly-' + dateString));
            });
        }).on('error', (err) => {
            console.log('Error: ' + err.message);
            reject(err);
        });
    });
    return request.then((dateString) => {
        window.showInformationMessage(`RLS found on nightly channel ${dateString}`);
        return dateString;
    }).catch((e) => {
        if (e && e.code === 'ENOTFOUND') {
            throw e;
        }
        // Try the day before
        return findLatestRlsVerion(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1));
    });
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

async function installRls(): Promise<string> {
    startSpinner('Installing RLS components');

    const tryFn: (component: string, channel: string) => Promise<(Error | null)> = async (component: string, channel: string) => {
        try {
            const { stdout, stderr, } = await execChildProcess(CONFIGURATION.rustupPath + ` component add ${component} --toolchain ${channel}`);
            console.log(stdout);
            console.log(stderr);
            return null;
        }
        catch (_e) {
            window.showErrorMessage(`Could not install RLS component (${component}) on configured channel.`);
            const err = new Error(`installing ${component} failed`);
            return err;
        }
    };

    window.showInformationMessage('Attempting to install RLS on a previous nightly channel');
    const latest = await findLatestRlsVerion(new Date());
    const channel = `nightly-${latest}`;

    {
        const e = await tryFn('rust-analysis', channel);
        if (e !== null) {
            stopSpinner('Could not install RLS');
            throw e;
        }
    }

    {
        const e = await tryFn('rust-src', channel);
        if (e !== null) {
            stopSpinner('Could not install RLS');
            throw e;
        }
    }

    console.log('Install rls on the channel ' + channel);
    {
        await tryToInstallToolchain(channel);
        const e = await tryFn(CONFIGURATION.componentName, channel);
        if (e !== null) {
            stopSpinner('Could not install RLS');
            throw e;
        }
    }

    stopSpinner('RLS components installed successfully');
    return channel;
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
