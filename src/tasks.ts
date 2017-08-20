// Copyright 2017 The RLS Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

import { workspace, window } from 'vscode';

export async function addBuildCommands(): Promise<string | undefined> {
    const config = workspace.getConfiguration();

    if (!!config['tasks']) {
        return Promise.resolve(window.showInformationMessage('tasks.json has other tasks. Any tasks are not added.'));
    }

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
    const defaultProblemMatcher = {
        "fileLocation": ["relative", "${workspaceRoot}"],
        "pattern": [{
                "regexp": "^(warning|warn|error)(\\[(.*)\\])?: (.*)$",
                "severity": 1,
                "message": 4,
                //The error code of the error, if available.
                //Not all errors will have a code reported.
                "code": 3
            },
            {
                "regexp": "^([\\s->=]*(.*):(\\d*):(\\d*)|.*)$",
                "file": 2,
                "line": 3,
                "column": 4
            },
            {
                "regexp": "^.*$"
            },
            {
                "regexp": "^([\\s->=]*(.*):(\\d*):(\\d*)|.*)$",
                "file": 2,
                "line": 3,
                "column": 4
            }
        ]
    };

    const tasks = {
        //Using the post VSC 1.14 task schema.
        "version": "2.0.0",
        "command": "cargo",
        "type": "shell",
        "presentation" : { "reveal": "always", "panel":"new" },
        "suppressTaskName": true,
        "tasks": [
            {
                "taskName": "cargo build",
                "args": ["build"],
                "group": "build",
                "problemMatcher": defaultProblemMatcher
            },
            {
                "taskName": "cargo run",
                "args": ["run"],
                "problemMatcher": defaultProblemMatcher
            },
            {
                "taskName": "cargo test",
                "args": ["test"],
                "group": "test",
                "problemMatcher": defaultProblemMatcher
            },
            {
                "taskName": "cargo clean",
                "args": ["clean"]
            }
        ]
    };

    return tasks;
}