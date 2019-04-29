import { CancellationToken, Disposable, Task, TaskProvider, workspace } from 'vscode';

import Cargo from '.';
import { Factory } from '../util';
import { Context } from '../util/context';
import CargoTaskFactory from './task_factory';
import CargoWorkspace from './workspace';

export default class CargoTaskProvider implements TaskProvider, Disposable {
  private readonly tasksFactory: CargoTaskFactory = new CargoTaskFactory(
    this.cargo,
    this.cargoWorkspace,
  );

  constructor(
    readonly cargo: Factory<Cargo>,
    readonly cargoWorkspace: Factory<CargoWorkspace>,
  ) { }

  public async resolveTask(
    task: Task,
    _token?: CancellationToken | undefined,
  ): Promise<Task | undefined> {
    console.log('resolveTask', task);
    return;
  }

  public async provideTasks(
    _token?: CancellationToken | undefined,
  ): Promise<Task[] | undefined> {
    if (!workspace.workspaceFolders) {
      return;
    }

    const promises: Array<Promise<void>> = [];
    const tasks: Task[] = [];

    for (const ws of workspace.workspaceFolders) {
      const promise = this.tasksFactory
        .get(Context.root(ws, 'Resolving cargo tasks'))
        .then(
          (ts): void => {
            tasks.push(...ts);
          },
        );
      promises.push(promise);
    }

    await Promise.all(promises);

    return tasks;
  }

  public dispose() {
    this.tasksFactory.dispose();
  }
}
