import { expect } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
// tslint:disable-next-line: no-duplicate-imports
import { Disposable, Uri } from 'vscode';

import * as extension from '../../src/extension';
import { Observable } from '../../src/utils/observable';

const fixtureDir = path.resolve(
  path.join(__dirname, '..', '..', '..', 'fixtures'),
);

suite('Extension Tests', () => {
  test('cargo tasks are auto-detected', async () => {
    // Activate manually to ease the access to internal, exported APIs without
    // having to open any file before
    const ext = vscode.extensions.getExtension<extension.Api>(
      'rust-lang.rust',
    )!;
    const { activeWorkspace } = await ext.activate();

    const projects = [
      path.join(fixtureDir, 'bare-lib-project'),
      path.join(fixtureDir, 'another-lib-project'),
    ].map(path => Uri.file(path).fsPath);

    const expected = [
      { subcommand: 'build', group: vscode.TaskGroup.Build, cwd: projects[0] },
      { subcommand: 'build', group: vscode.TaskGroup.Build, cwd: projects[1] },
      { subcommand: 'check', group: vscode.TaskGroup.Build, cwd: projects[0] },
      { subcommand: 'check', group: vscode.TaskGroup.Build, cwd: projects[1] },
      { subcommand: 'test', group: vscode.TaskGroup.Test, cwd: projects[1] },
      { subcommand: 'clean', group: vscode.TaskGroup.Clean, cwd: projects[1] },
      { subcommand: 'run', group: undefined, cwd: projects[1] },
    ];

    const whenWorkspacesActive = projects.map(path =>
      whenWorkspaceActive(activeWorkspace, path),
    );

    // This makes sure that we set the focus on the opened files (which is what
    // actually triggers the extension for the project)
    await vscode.commands.executeCommand(
      'workbench.action.quickOpen',
      path.join(projects[0], 'src', 'lib.rs'),
    );
    await vscode.commands.executeCommand(
      'workbench.action.acceptSelectedQuickOpenItem',
    );
    await vscode.commands.executeCommand('workbench.action.keepEditor');
    // Wait until the first server is ready
    await whenWorkspacesActive[0];

    expect(await fetchBriefTasks()).to.include.deep.members([expected[0]]);

    // Now test for the second project
    await vscode.commands.executeCommand(
      'workbench.action.quickOpen',
      path.join(projects[1], 'src', 'lib.rs'),
    );
    await vscode.commands.executeCommand(
      'workbench.action.acceptSelectedQuickOpenItem',
    );
    // Wait until the second server is ready
    await whenWorkspacesActive[1];
    expect(await fetchBriefTasks()).to.include.deep.members(expected);
  }).timeout(60000);
});

/** Fetches current VSCode tasks' partial objects for ease of assertion */
async function fetchBriefTasks(): Promise<
  Array<{
    subcommand: string;
    group: vscode.TaskGroup | undefined;
    cwd?: string;
  }>
> {
  const tasks = await vscode.tasks.fetchTasks();

  return tasks.map(task => ({
    subcommand: task.definition.subcommand,
    group: task.group,
    cwd: task.execution && task.execution.options && task.execution.options.cwd,
  }));
}

/**
 * Returns a promise when a client workspace will become active with a given path.
 * @param fsPath normalized file system path of a URI
 */
function whenWorkspaceActive(
  observable: Observable<extension.ClientWorkspace | null>,
  fsPath: string,
): Promise<extension.ClientWorkspace> {
  return new Promise(resolve => {
    let disposable: Disposable | undefined;
    disposable = observable.observe(value => {
      if (value && value.folder.uri.fsPath === fsPath) {
        if (disposable) {
          disposable.dispose();
          disposable = undefined;
        }

        resolve(value);
      }
    });
  });
}
