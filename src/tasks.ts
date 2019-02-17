// Copyright 2017 The RLS Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

import { Disposable, ShellExecution, ShellExecutionOptions, Task, TaskDefinition, TaskGroup, TaskPanelKind, TaskPresentationOptions, TaskProvider, TaskRevealKind, WorkspaceFolder, tasks, TaskExecution } from 'vscode';

export function activateTaskProvider(target: WorkspaceFolder): Disposable {
    const provider: TaskProvider = {
        provideTasks: function () {
            // npm or others parse their task definitions. So they need to provide 'autoDetect' feature.
            //  e,g, https://github.com/Microsoft/vscode/blob/de7e216e9ebcad74f918a025fc5fe7bdbe0d75b2/extensions/npm/src/main.ts
            // However, cargo.toml does not support to define a new task like them.
            // So we are not 'autoDetect' feature and the setting for it.
            return getCargoTasks(target);
        },
        resolveTask(_task: Task): Task | undefined {
            return undefined;
        }
    };

    return tasks.registerTaskProvider('cargo', provider);
}

interface CargoTaskDefinition extends TaskDefinition {
    type: 'cargo';
    label: string;
    command: string;
    args: Array<string>;
    env?: { [key: string]: string };
}

interface TaskConfigItem {
    definition: CargoTaskDefinition;
    problemMatcher: Array<string>;
    group?: TaskGroup;
    presentationOptions?: TaskPresentationOptions;
}

function getCargoTasks(target: WorkspaceFolder): Array<Task> {
    const taskList = createTaskConfigItem();

    const list = taskList.map((def) => {
        const t = createTask(def, target);
        return t;
    });

    return list;
}

function createTask({ definition, group, presentationOptions, problemMatcher }: TaskConfigItem, target: WorkspaceFolder): Task {
    const TASK_SOURCE = 'Rust';

    const execCmd = `${definition.command} ${definition.args.join(' ')}`;
    const execOption: ShellExecutionOptions = {
        cwd: target.uri.fsPath,
        env: Object.assign({}, process.env, definition.env),
    };
    const exec = new ShellExecution(execCmd, execOption);

    const t = new Task(definition, target, definition.label, TASK_SOURCE, exec, problemMatcher);

    if (group !== undefined) {
        t.group = group;
    }

    if (presentationOptions !== undefined) {
        t.presentationOptions = presentationOptions;
    }

    return t;
}

function createTaskConfigItem(): Array<TaskConfigItem> {
    const problemMatcher = ['$rustc'];

    const presentationOptions: TaskPresentationOptions = {
        reveal: TaskRevealKind.Always,
        panel: TaskPanelKind.Dedicated,
    };

    const taskList: Array<TaskConfigItem> = [
        {
            definition: {
                label: 'cargo build',
                type: 'cargo',
                command: 'cargo',
                args: [
                    'build'
                ],
            },
            problemMatcher,
            group: TaskGroup.Build,
            presentationOptions,
        },
        {
            definition: {
                label: 'cargo check',
                type: 'cargo',
                command: 'cargo',
                args: [
                    'check'
                ],
            },
            problemMatcher,
            group: TaskGroup.Build,
            presentationOptions,
        },
        {
            definition: {
                label: 'cargo run',
                type: 'cargo',
                command: 'cargo',
                args: [
                    'run'
                ],
            },
            problemMatcher,
            presentationOptions,
        },
        {
            definition: {
                label: 'cargo test',
                type: 'cargo',
                command: 'cargo',
                args: [
                    'test'
                ],
            },
            problemMatcher,
            group: TaskGroup.Test,
            presentationOptions,
        },
        {
            definition: {
                label: 'cargo bench',
                type: 'cargo',
                command: 'cargo',
                args: [
                    '+nightly',
                    'bench'
                ],
            },
            problemMatcher,
            group: TaskGroup.Test,
            presentationOptions,
        },
        {
            definition: {
                label: 'cargo clean',
                type: 'cargo',
                command: 'cargo',
                args: [
                    'clean'
                ],
            },
            problemMatcher: [],
            presentationOptions,
        },
    ];

    return taskList;
}

export interface Cmd {
    binary: string;
    args: string[];
    env: { [key: string]: string };
}

export function runCommand(folder: WorkspaceFolder, cmd: Cmd): Thenable<TaskExecution> {
    const config: TaskConfigItem = {
        definition: {
            label: 'run Cargo command',
            type: 'cargo',
            command: cmd.binary,
            args: cmd.args,
            env: cmd.env,
        },
        problemMatcher: ['$rustc'],
        group: TaskGroup.Build,
        presentationOptions: {
            reveal: TaskRevealKind.Always,
            panel: TaskPanelKind.Dedicated,
        },
    };
    const task = createTask(config, folder);
    return tasks.executeTask(task);
}
