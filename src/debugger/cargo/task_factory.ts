import { dirname } from 'path';
import { ProcessExecution, Task, Uri, workspace } from 'vscode';

import Cargo from '.';
import { CachingFactory, Factory } from '../util';
import { Context } from '../util/context';
import Package from './package';
import CargoWorkspace from './workspace';

export default class CargoTaskFactory extends CachingFactory<Task[]> {
  constructor(
    private readonly cargo: Factory<Cargo>,
    private readonly cargoWorkspace: Factory<CargoWorkspace>,
  ) {
    super([cargo, cargoWorkspace]);
  }

  public async get_uncached(ctx: Context): Promise<Task[]> {
    const cargo = await this.cargo.get(ctx);
    function makeTask(crate: Package, cmd: string[]): Task {
      const dir = dirname(crate.manifest_path);

      return new Task(
        {
          type: 'cargo',
          crate: crate.name,
          cmd,
        },
        ctx.ws,
        `${cmd.join(' ')} (${crate.name})`,
        `Cargo`,
        new ProcessExecution(cargo.executable, cmd, {
          cwd: dir,
        }),
        ['$rustc'],
      );
    }

    const cargoWorkspace = await this.cargoWorkspace.get(ctx);

    const tasks: Task[] = [];

    for (const member of cargoWorkspace.members) {
      if (
        workspace.getWorkspaceFolder(Uri.file(member.manifest_path)) !== ctx.ws
      ) {
        console.log('Not mine', member.manifest_path, ctx.ws.uri.fsPath);
        continue;
      }
      tasks.push(makeTask(member, ['check']));

      for (const tt of member.targets) {
        const kind = tt.kind[0];
        console.log('Task target kind: ', kind);

        if (kind === 'bin') {
          tasks.push(makeTask(member, ['install', '--bin', tt.name]));
        }

        if (kind === 'test') {
          tasks.push(makeTask(member, ['test', '--test', tt.name]));
        }
      }
    }

    return tasks;
  }
}
