import * as crypto from 'crypto';
import {
  Disposable,
  ShellExecution,
  Task,
  TaskDefinition,
  TaskGroup,
  TaskPanelKind,
  TaskPresentationOptions,
  TaskProvider,
  TaskRevealKind,
  tasks,
  workspace,
  WorkspaceFolder,
} from 'vscode';

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

export function activateTaskProvider(target: WorkspaceFolder): Disposable {
  const provider: TaskProvider = {
    provideTasks: () => {
      // npm or others parse their task definitions. So they need to provide 'autoDetect' feature.
      //  e,g, https://github.com/Microsoft/vscode/blob/de7e216e9ebcad74f918a025fc5fe7bdbe0d75b2/extensions/npm/src/main.ts
      // However, cargo.toml does not support to define a new task like them.
      // So we are not 'autoDetect' feature and the setting for it.
      return createDefaultTasks(target);
    },
    resolveTask: () => undefined,
  };

  return tasks.registerTaskProvider('cargo', provider);
}

const TASK_SOURCE = 'Rust';

interface TaskConfigItem {
  label: string;
  definition: TaskDefinition;
  execution: Execution;
  problemMatchers: string[];
  group?: TaskGroup;
  presentationOptions?: TaskPresentationOptions;
}

function createDefaultTasks(target: WorkspaceFolder): Task[] {
  return createTaskConfigItem().map(def => createCargoTask(def, target));
}

function createCargoTask(cfg: TaskConfigItem, target: WorkspaceFolder): Task {
  const { binary, command, args, cwd, env } = cfg.execution;
  const cmdLine = `${command || binary} ${args.join(' ')}`;
  const execution = new ShellExecution(cmdLine, { cwd, env });

  const { definition, problemMatchers, presentationOptions, group } = cfg;
  return {
    definition,
    scope: target,
    name: definition.label,
    source: TASK_SOURCE,
    execution,
    isBackground: false,
    problemMatchers,
    presentationOptions: presentationOptions || {},
    runOptions: {},
    ...{ group },
  };
}

function createTaskConfigItem(): TaskConfigItem[] {
  const common = {
    definition: { type: 'cargo' },
    problemMatchers: ['$rustc'],
    presentationOptions: {
      reveal: TaskRevealKind.Always,
      panel: TaskPanelKind.Dedicated,
    },
  };

  return [
    {
      label: 'cargo build',
      execution: { command: 'cargo', args: ['build'] },
      group: TaskGroup.Build,
      ...common,
    },
    {
      label: 'cargo check',
      execution: { command: 'cargo', args: ['check'] },
      group: TaskGroup.Build,
      ...common,
    },
    {
      label: 'cargo run',
      execution: { command: 'cargo', args: ['run'] },
      ...common,
    },
    {
      label: 'cargo test',
      execution: { command: 'cargo', args: ['test'] },
      group: TaskGroup.Test,
      ...common,
    },
    {
      label: 'cargo bench',
      execution: { command: 'cargo', args: ['+nightly', 'bench'] },
      group: TaskGroup.Test,
      ...common,
    },
    {
      label: 'cargo clean',
      execution: { command: 'cargo', args: ['clean'] },
      ...common,
    },
  ];
}

// NOTE: `execution` parameters here are sent by the RLS.
export function runCargoCommand(folder: WorkspaceFolder, execution: Execution) {
  const config: TaskConfigItem = {
    label: 'run Cargo command',
    definition: { type: 'cargo' },
    execution,
    problemMatchers: ['$rustc'],
    group: TaskGroup.Build,
    presentationOptions: {
      reveal: TaskRevealKind.Always,
      panel: TaskPanelKind.Dedicated,
    },
  };
  const task = createCargoTask(config, folder);
  return tasks.executeTask(task);
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
  const uniqueId = crypto.randomBytes(20).toString();

  const task = new Task(
    { label: uniqueId, type: 'setup' },
    folder ? folder : workspace.workspaceFolders![0],
    displayName,
    TASK_SOURCE,
    new ShellExecution(`${command} ${args.join(' ')}`, {
      cwd: cwd || (folder && folder.uri.fsPath),
      env,
    }),
  );

  return new Promise(resolve => {
    const disposable = tasks.onDidEndTask(({ execution }) => {
      if (execution.task === task) {
        disposable.dispose();
        resolve();
      }
    });

    tasks.executeTask(task);
  });
}
