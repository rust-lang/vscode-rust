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
        this.logToFile = configuration.get<boolean>('rust-client.logToFile', false);
        this.revealOutputChannelOn = RLSConfiguration.readRevealOutputChannelOn(configuration);
        this.updateOnStartup = configuration.get<boolean>('rust-client.updateOnStartup', true);

        this.channel = configuration.get('rust-client.channel', 'nightly');
        this.componentName = configuration.get('rust-client.rls-name', 'rls');

        // Hidden options that are not exposed to the user
        this.rlsPath = configuration.get('rls.path', null);
        this.rlsRoot = configuration.get('rls.root', null);
    }
    private static readRevealOutputChannelOn(configuration: WorkspaceConfiguration) {
        const setting = configuration.get<string>('rust-client.revealOutputChannelOn', 'never');
        return fromStringToRevealOutputChannelOn(setting);
    }
}
