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
    const projectPath = fixtureDir;
    const projectUri = Uri.file(projectPath);
    const projects = [
      path.join(projectPath, 'bare-lib-project'),
      path.join(projectPath, 'another-lib-project'),
    ];

    await vscode.commands.executeCommand('vscode.openFolder', projectUri);
    await vscode.workspace.openTextDocument(
      Uri.file(path.join(projects[0], 'src', 'lib.rs')),
    );
    await vscode.workspace.openTextDocument(
      Uri.file(path.join(projects[1], 'src', 'lib.rs')),
    );

    const expected = [
      { subcommand: 'build', group: vscode.TaskGroup.Build, cwd: projects[0] },
      { subcommand: 'build', group: vscode.TaskGroup.Build, cwd: projects[1] },
      { subcommand: 'check', group: vscode.TaskGroup.Build },
      { subcommand: 'test', group: vscode.TaskGroup.Test },
      { subcommand: 'clean', group: vscode.TaskGroup.Clean },
      { subcommand: 'run', group: undefined },
    ];

    const tasks = await vscode.tasks.fetchTasks();

    for (const { subcommand, group, cwd } of expected) {
      assert(
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
  }).timeout(0);
});
