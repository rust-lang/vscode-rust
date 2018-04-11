// Copyright 2017 The RLS Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

import {
    Disposable,
    TaskProvider,
    Task,
    TaskDefinition,
    TaskGroup,
    TaskPanelKind,
    TaskPresentationOptions,
    TaskRevealKind,
    ShellExecution,
    ShellExecutionOptions,
    workspace,
} from 'vscode';

let taskProvider: Disposable | null = null;

export function activateTaskProvider(): void {
    if (taskProvider !== null) {
        console.log('the task provider has been activated');
        return;
    }

    const provider: TaskProvider = {
        provideTasks: function () {
            // npm or others parse their task definitions. So they need to provide 'autoDetect' feature.
            //  e,g, https://github.com/Microsoft/vscode/blob/de7e216e9ebcad74f918a025fc5fe7bdbe0d75b2/extensions/npm/src/main.ts
            // However, cargo.toml does not support to define a new task like them.
            // So we are not 'autoDetect' feature and the setting for it.
            return getCargoTasks();
        },
        resolveTask(_task: Task): Task | undefined {
            return undefined;
        }
    };

    taskProvider = workspace.registerTaskProvider('rust', provider);
}

export function deactivateTaskProvider(): void {
    if (taskProvider !== null) {
        taskProvider.dispose();
    }
}

interface CargoTaskDefinition extends TaskDefinition {
    // FIXME: By the document, we should add the `taskDefinitions` section to our package.json and use the value of it.
    type: 'shell';
    label: string;
    command: string;
    args: Array<string>;
}

interface TaskConfigItem {
    definition: CargoTaskDefinition;
    problemMatcher: Array<string>;
    group?: TaskGroup;
    presentationOptions?: TaskPresentationOptions;
}

function getCargoTasks(): Array<Task> {
    const taskList = createTaskConfigItem();

    const rootPath = workspace.rootPath;
    if (rootPath === undefined) {
        return [];
    }

    const list = taskList.map((def) => {
        const t = createTask(rootPath, def);
        return t;
    });

    return list;
}

function createTask(rootPath: string, { definition, group, presentationOptions, problemMatcher }: TaskConfigItem): Task {
    const TASK_SOURCE = 'Rust';

    const execCmd = `${definition.command} ${definition.args.join(' ')}`;
    const execOption: ShellExecutionOptions = {
        cwd: rootPath,
    };
    const exec = new ShellExecution(execCmd, execOption);

    const t = new Task(definition, definition.label, TASK_SOURCE, exec, problemMatcher);

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
        panel: TaskPanelKind.New,
    };

    const taskList: Array<TaskConfigItem> = [
        {
            definition: {
                label: 'cargo build',
                type: 'shell',
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
                type: 'shell',
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
                type: 'shell',
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
                type: 'shell',
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
                type: 'shell',
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
                type: 'shell',
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
