import {
  Disposable,
  ShellExecution,
  Task,
  TaskDefinition,
  TaskGroup,
  TaskProvider,
  tasks,
  workspace,
  WorkspaceFolder,
} from 'vscode';
import { ensurePackage, isPackageInstalled } from './cargo';

/**
 * Displayed identifier associated with each task.
 */
const TASK_SOURCE = 'Rust';
/**
 * Internal VSCode task type (namespace) under which extensions register their
 * tasks. We only use `cargo` task type.
 */
const TASK_TYPE = 'cargo';

interface CargoTaskDefinition extends TaskDefinition {
  readonly type: 'cargo';
  readonly subcommand: string;
}

interface CargoTask extends Task {
  definition: CargoTaskDefinition;
}

function isCargoTask(task: Task): task is CargoTask {
  return task.definition.type === 'cargo';
}

/**
 * Command execution parameters sent by the RLS (as of 1.35).
 */
export interface Execution {
  /**
   * @deprecated Previously, the usage was not restricted to spawning with a
   * file, so the name is changed to reflect the more permissive usage and to be
   * less misleading (still used by RLS 1.35). Use `command` instead.
   */
  binary?: string;
  command?: string;
  args: string[];
  env?: { [key: string]: string };
  // NOTE: Not actually sent by RLS but unifies a common execution definition
  cwd?: string;
}

/**
 * Creates a Task-used `ShellExecution` from a unified `Execution` interface.
 */
function createShellExecution(execution: Execution): ShellExecution {
  const { binary, command, args, cwd, env } = execution;
  const cmdLine = `${command || binary} ${args.join(' ')}`;
  return new ShellExecution(cmdLine, { cwd, env });
}

export function activateTaskProvider(target: WorkspaceFolder): Disposable {
  const provider: TaskProvider = {
    // Tasks returned by this function are treated as 'auto-detected' [1] and
    // are treated a bit differently. They are always available and can be
    // only tweaked (and not removed) in tasks.json.
    // This is to support npm-style scripts, which store project-specific
    // scripts in the project manifest. However, Cargo.toml does not support
    // anything like that, so we just try our best to help the user and present
    // them with most commonly used `cargo` subcommands (e.g. `build`).
    // Since typically they would need to parse their task definitions, an
    // optional `autoDetect` configuration is usually provided, which we don't.
    //
    // [1]: https://code.visualstudio.com/docs/editor/tasks#_task-autodetection
    provideTasks: () => detectCargoTasks(target),
    resolveTask: async task => {
      if (!isCargoTask(task)) {
        return undefined;
      }

      if (task.definition.subcommand === 'watch') {
        await ensurePackage('cargo-watch');

        return new Task(
          task.definition,
          target,
          task.name,
          task.source,
          createShellExecution({
            command: 'cargo',
            args: ['watch', '--clear'],
            cwd: target.uri.fsPath,
          }),
          ['$rustc'],
        );
      }

      return undefined;
    },
  };

  return tasks.registerTaskProvider(TASK_TYPE, provider);
}

async function detectCargoTasks(target: WorkspaceFolder): Promise<Task[]> {
  const tasks = [
    { subcommand: 'build', group: TaskGroup.Build },
    { subcommand: 'check', group: TaskGroup.Build },
    { subcommand: 'test', group: TaskGroup.Test },
    { subcommand: 'clean', group: TaskGroup.Clean },
    { subcommand: 'run', group: undefined },
  ];

  if (await isPackageInstalled('cargo-watch')) {
    tasks.push({ subcommand: 'watch', group: TaskGroup.Build });
  }

  return tasks
    .map(({ subcommand, group }) => ({
      definition: { subcommand, type: TASK_TYPE },
      label: `cargo ${subcommand} - ${target.name}`,
      execution: createShellExecution({
        command: 'cargo',
        args: [subcommand],
        cwd: target.uri.fsPath,
      }),
      group,
      problemMatchers: ['$rustc'],
    }))
    .map(task => {
      // NOTE: It's important to solely use the VSCode-provided constructor (and
      // *not* use object spread operator!) - otherwise the task will not be picked
      // up by VSCode.
      const vscodeTask = new Task(
        task.definition,
        target,
        task.label,
        TASK_SOURCE,
        task.execution,
        task.problemMatchers,
      );
      vscodeTask.group = task.group;
      return vscodeTask;
    });
}

// NOTE: `execution` parameters here are sent by the RLS.
export function runRlsCommand(folder: WorkspaceFolder, execution: Execution) {
  const shellExecution = createShellExecution(execution);
  const problemMatchers = ['$rustc'];

  return tasks.executeTask(
    new Task(
      { type: 'shell' },
      folder,
      'External RLS command',
      TASK_SOURCE,
      shellExecution,
      problemMatchers,
    ),
  );
}

/**
 * Starts a shell command as a VSCode task, resolves when a task is finished.
 * Useful in tandem with setup commands, since the task window is reusable and
 * also capable of displaying ANSI terminal colors. Exit codes are not
 * supported, however.
 */
export async function runTaskCommand(
  { command, args, env, cwd }: Execution,
  displayName: string,
  folder?: WorkspaceFolder,
) {
  // Task finish callback does not preserve concrete task definitions, we so
  // disambiguate finished tasks via executed command line.
  const commandLine = `${command} ${args.join(' ')}`;

  const task = new Task(
    { type: 'shell' },
    folder || workspace.workspaceFolders![0],
    displayName,
    TASK_SOURCE,
    new ShellExecution(commandLine, {
      cwd: cwd || (folder && folder.uri.fsPath),
      env,
    }),
  );

  return new Promise(resolve => {
    const disposable = tasks.onDidEndTask(({ execution }) => {
      const taskExecution = execution.task.execution;
      if (
        taskExecution instanceof ShellExecution &&
        taskExecution.commandLine === commandLine
      ) {
        disposable.dispose();
        resolve();
      }
    });

    tasks.executeTask(task);
  });
}
