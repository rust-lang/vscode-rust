import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
// tslint:disable-next-line: no-duplicate-imports
import { Uri } from 'vscode';

const fixtureDir = path.resolve(
  path.join(__dirname, '..', '..', '..', 'fixtures'),
);

suite('Extension Tests', () => {
  test('cargo tasks are auto-detected', async () => {
    const projects = [
      path.join(fixtureDir, 'bare-lib-project'),
      path.join(fixtureDir, 'another-lib-project'),
    ];

    const expected = [
      { subcommand: 'build', group: vscode.TaskGroup.Build, cwd: projects[0] },
      { subcommand: 'build', group: vscode.TaskGroup.Build, cwd: projects[1] },
      { subcommand: 'check', group: vscode.TaskGroup.Build },
      { subcommand: 'test', group: vscode.TaskGroup.Test },
      { subcommand: 'clean', group: vscode.TaskGroup.Clean },
      { subcommand: 'run', group: undefined },
    ];

    await vscode.commands.executeCommand('vscode.openFolder', projectUri);

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
    // Unfortunately, we need to wait a bit for the extension to kick in :(
    // FIXME: See if we can directly import our extension and await its progress
    await new Promise(resolve => setTimeout(resolve, 500));
    assert(await currentTasksInclude([expected[0]]));

    // Now test for the second project
    await vscode.commands.executeCommand(
      'workbench.action.quickOpen',
      path.join(projects[1], 'src', 'lib.rs'),
    );
    await vscode.commands.executeCommand(
      'workbench.action.acceptSelectedQuickOpenItem',
    );
    await new Promise(resolve => setTimeout(resolve, 500));
    assert(await currentTasksInclude(expected));
  }).timeout(0);
});

async function currentTasksInclude(
  expected: Array<{
    subcommand: string;
    group: vscode.TaskGroup | undefined;
    cwd?: string;
  }>,
): Promise<boolean> {
  const tasks = await vscode.tasks.fetchTasks();

  return expected.every(({ subcommand, group, cwd }) =>
    tasks.some(
      task =>
        task.definition.type === 'cargo' &&
        task.definition.subcommand === subcommand &&
        task.group === group &&
        (!cwd ||
          cwd ===
            (task.execution &&
              task.execution.options &&
              task.execution.options.cwd)),
    ),
  );
}
