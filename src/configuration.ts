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

import { getActiveChannel } from './rustup';

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
     * If specified, RLS will be spawned by executing a file at the given path.
     */
    public readonly rlsPath: string | null;

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

        // Path to the rls. Prefer `rust-client.rlsPath` if present, otherwise consider
        // the depreacted `rls.path` setting.
        const rlsPath = configuration.get('rls.path', null);
        if (rlsPath) {
            console.warn('`rls.path` has been deprecated; prefer `rust-client.rlsPath`');
        }
        this.rlsPath = configuration.get('rust-client.rlsPath', null);
        if (!this.rlsPath) {
            this.rlsPath = rlsPath;
        }
    }

    private static readRevealOutputChannelOn(configuration: WorkspaceConfiguration) {
        const setting = configuration.get<string>('rust-client.revealOutputChannelOn', 'never');
        return fromStringToRevealOutputChannelOn(setting);
    }

    /**
     * Tries to fetch the `rust-client.channel` configuration value. If missing,
     * falls back on active toolchain specified by rustup (at `rustupPath`),
     * finally defaulting to `nightly` if all fails.
     */
    private static readChannel(rustupPath: string, configuration: WorkspaceConfiguration): string {
        const channel = configuration.get<string | null>('rust-client.channel', null);
        if (channel !== null) {
            return channel;
        } else {
            try {
                return getActiveChannel(rustupPath);
            }
            // rustup might not be installed at the time the configuration is
            // initially loaded, so silently ignore the error and return a default value
            catch (e) {
                return 'nightly';
            }

        }
    }
}
