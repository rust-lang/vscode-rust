import { ProgressLocation, window, WorkspaceFolder } from 'vscode';

export class Context {
  private constructor(
    private readonly parent: Context | undefined,
    readonly ws: WorkspaceFolder,
    readonly taskName: string,
  ) {}

  public static root(ws: WorkspaceFolder, taskName: string): Context {
    return new Context(undefined, ws, taskName);
  }

  public runWith<T>(op: (c: Context) => Promise<T>): Promise<T> {
    return this.withProgress(op(this));
  }

  public subTask<T>(
    name: string,
    op: (ctx: Context) => Promise<T>,
  ): Promise<T> {
    const sub = new Context(this, this.ws, name);
    const task = op(sub);

    return sub.withProgress(task);
  }

  private get taskStack(): string[] {
    if (!this.parent) {
      return [this.taskName];
    } else {
      return [...this.parent.taskStack, this.taskName];
    }
  }

  private async withProgress<T>(task: Promise<T>): Promise<T> {
    return window.withProgress(
      {
        location: ProgressLocation.Window,
      },
      async progress => {
        progress.report({ message: this.taskStack.join(' - ') });
        const res = await task;

        return res;
      },
    );
  }
}
