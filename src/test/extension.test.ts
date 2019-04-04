import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
// tslint:disable-next-line: no-duplicate-imports
import { Uri } from 'vscode';

const fixtureDir = path.resolve(path.join(__dirname, '..', '..', 'fixtures'));

suite('Extension Tests', () => {
  test('cargo tasks are auto-detected', async () => {
    const projectPath = path.join(fixtureDir, 'bare-lib-project');
    const projectUri = Uri.file(projectPath);

    await vscode.commands.executeCommand('vscode.openFolder', projectUri);
    await vscode.workspace.openTextDocument(
      Uri.file(path.join(projectPath, 'src', 'lib.rs')),
    );

    const expected = [
      { subcommand: 'build', group: vscode.TaskGroup.Build },
      { subcommand: 'check', group: vscode.TaskGroup.Build },
      { subcommand: 'test', group: vscode.TaskGroup.Test },
      { subcommand: 'clean', group: vscode.TaskGroup.Clean },
    ];

    const tasks = await vscode.tasks.fetchTasks();

    for (const { subcommand, group } of expected) {
      assert(
        tasks.some(
          task =>
            task.definition.type === 'cargo' &&
            task.definition.subcommand === subcommand &&
            task.group === group,
        ),
      );
    }
  }).timeout(0);
});
