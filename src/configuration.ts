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

import { workspace, WorkspaceConfiguration } from 'vscode';
import { RevealOutputChannelOn } from 'vscode-languageclient';
import * as child_process from 'child_process';

import { parseActiveToolchain } from './rustup';

function fromStringToRevealOutputChannelOn(value: string): RevealOutputChannelOn {
    switch (value && value.toLowerCase()) {
        case 'info':
            return RevealOutputChannelOn.Info;
        case 'warn':
            return RevealOutputChannelOn.Warn;
        case 'error':
            return RevealOutputChannelOn.Error;
        case 'never':
        default:
            return RevealOutputChannelOn.Never;
    }
}

export class RLSConfiguration {
    public readonly rustupPath: string;
    public readonly logToFile: boolean;
    public readonly revealOutputChannelOn: RevealOutputChannelOn = RevealOutputChannelOn.Never;
    public readonly updateOnStartup: boolean;
    public readonly channel: string;
    public readonly componentName: string;
    /**
     * Hidden option that can be specified via `"rls.path"` key (e.g. to `/usr/bin/rls`). If
     * specified, RLS will be spawned by executing a file at the given path.
     */
    public readonly rlsPath: string | null;
    /**
     * Hidden option that can be specified via `"rls.root"` key (e.g. to `/home/<user>/rls/repo`).
     * If specified, RLS will be spawned by executing `cargo run --release` under a given working
     * directory.
     */
    public readonly rlsRoot: string | null;

    public static loadFromWorkspace(): RLSConfiguration {
        const configuration = workspace.getConfiguration();

        return new RLSConfiguration(configuration);
    }

    private constructor(configuration: WorkspaceConfiguration) {
        this.rustupPath = configuration.get('rust-client.rustupPath', 'rustup');
        this.logToFile = configuration.get<boolean>('rust-client.logToFile', false);
        this.revealOutputChannelOn = RLSConfiguration.readRevealOutputChannelOn(configuration);
        this.updateOnStartup = configuration.get<boolean>('rust-client.updateOnStartup', true);

        this.channel = RLSConfiguration.readChannel(this.rustupPath, configuration);
        this.componentName = configuration.get('rust-client.rls-name', 'rls');

        // Hidden options that are not exposed to the user
        this.rlsPath = configuration.get('rls.path', null);
        this.rlsRoot = configuration.get('rls.root', null);
    }

    private static readRevealOutputChannelOn(configuration: WorkspaceConfiguration) {
        const setting = configuration.get<string>('rust-client.revealOutputChannelOn', 'never');
        return fromStringToRevealOutputChannelOn(setting);
    }

    /**
     * Tries to fetch the `rust-client.channel` configuration value. If it's null,
     * then it tries to query active channel using rustup given at `rustupPath`.
     */
    private static readChannel(rustupPath: string, configuration: WorkspaceConfiguration): string {
        const channel = configuration.get<string | null>('rust-client.channel', null);
        if (channel !== null) {
            return channel;
        } else {
            try {
                // rustup info might differ depending on where it's executed
                // (e.g. when a toolchain is locally overriden), so executing it
                // under our current workspace root should give us close enough result
                const output = child_process.execSync(`${rustupPath} show`, {cwd: workspace.rootPath}).toString();

                const activeChannel = parseActiveToolchain(output);
                console.info(`Detected active channel: ${activeChannel} (since 'rust-client.channel' is unspecified)`);
                return activeChannel;
            }
            // rustup might not be installed at the time the configuration is
            // initially loaded, so silently ignore the error and return a default value
            catch (e) {
                return 'nightly';
            }

        }
    }
}
