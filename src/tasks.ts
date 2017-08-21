// Copyright 2017 The RLS Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

import { workspace, window, WorkspaceConfiguration } from 'vscode';

function getConfiguration(): { config: WorkspaceConfiguration; hasOtherTasks: boolean } {
    const config = workspace.getConfiguration();
    const hasOtherTasks: boolean = !!config['tasks'];

    return {
        config,
        hasOtherTasks,
    };
}

export async function addBuildCommandsOnOpeningProject(): Promise<string | undefined> {
    const { config, hasOtherTasks } = getConfiguration();
    if (hasOtherTasks) {
        return;
    }

    return addBuildCommands(config);
}

export async function addBuildCommandsByUser(): Promise<string | undefined> {
    const { config, hasOtherTasks } = getConfiguration();
    if (hasOtherTasks) {
        return Promise.resolve(window.showInformationMessage('tasks.json has other tasks. Any tasks are not added.'));
    }

    return addBuildCommands(config);
}

async function addBuildCommands(config: WorkspaceConfiguration): Promise<string | undefined> {
    try {
        const tasks = createDefaultTaskConfig();
        await Promise.resolve(config.update('tasks', tasks, false));
    }
    catch (e) {
        console.error(e);
        return Promise.resolve(window.showInformationMessage('Could not update tasks.json. Any tasks are not added.'));
    }

    return Promise.resolve(window.showInformationMessage('Added default build tasks for Rust'));    
}

function createDefaultTaskConfig(): object {
    const tasks = {
        //Using the post VSC 1.14 task schema.
        "version": "2.0.0",
        "presentation" : { "reveal": "always", "panel":"new" },
        "tasks": [
            {
                "taskName": "cargo build",
                "type": "shell",
                "command": "cargo",
                "args": ["build"],
                "group": "build",
                "problemMatcher": "$rustc"
            },
            {
                "taskName": "cargo run",
                "type": "shell",
                "command": "cargo",
                "args": ["run"],
                "problemMatcher": "$rustc"
            },
            {
                "taskName": "cargo test",
                "type": "shell",
                "command": "cargo",
                "args": ["test"],
                "group": "test",
                "problemMatcher": "$rustc"
            },
            {
                "taskName": "cargo clean",
                "type": "shell",
                "command": "cargo",
                "args": ["clean"]
            }
        ]
    };

    return tasks;
}