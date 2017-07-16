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

import { workspace, OutputChannel, WorkspaceConfiguration } from 'vscode';
import { RevealOutputChannelOn } from 'vscode-languageclient';

export namespace RevealOutputChannelOnUtil {
    export function fromString(value: string): RevealOutputChannelOn {
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
}

export class RLSConfiguration {
    public readonly showStderrInOutputChannel: boolean;
    public readonly logToFile: boolean;
    public readonly revealOutputChannelOn: RevealOutputChannelOn = RevealOutputChannelOn.Never;

    public static loadFromWorkspace(): RLSConfiguration {
        const configuration = workspace.getConfiguration();

        return new RLSConfiguration(configuration);
    }

    private constructor(configuration: WorkspaceConfiguration) {
        this.showStderrInOutputChannel = configuration.get<boolean>('rust-client.showStdErr', false);
        this.logToFile = configuration.get<boolean>('rust-client.logToFile', false);
        this.revealOutputChannelOn = RLSConfiguration.readRevealOutputChannelOn(configuration);
    }
    private static readRevealOutputChannelOn(configuration: WorkspaceConfiguration) {
        const setting = configuration.get<string>('rust-client.revealOutputChannelOn', 'never');
		return RevealOutputChannelOnUtil.fromString(setting);
    }
}
