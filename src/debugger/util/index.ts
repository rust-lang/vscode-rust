import { ChildProcess, execFile, spawn } from 'child_process';
import * as fs from 'fs';
import { relative } from 'path';
import {
    commands,
    Disposable,
    DocumentLink,
    Event,
    EventEmitter,
    SymbolInformation,
    Uri,
    WorkspaceFolder,
} from 'vscode';
import { trueCasePath } from './cli';
import { Context } from './context';

export function isDescendant(parent: string, descendant: string): boolean {
    return !relative(parent, descendant).startsWith('..');
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        fs.rename(oldPath, newPath, err => {
            if (!!err) {
                return reject(err);
            }

            return resolve();
        });
    });
}

export async function exists(path: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
        fs.stat(path, err => {
            if (!!err) {
                return resolve(false);
            }

            return resolve(true);
        });
    });
}

export async function readFile(path: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        fs.readFile(path, 'utf8', (err, data) => {
            if (!!err) {
                return reject(err);
            }
            return resolve(data);
        });
    });
}

// tslint:disable-next-line: no-any
export async function setContext(key: string, value: any): Promise<void> {
    await commands.executeCommand('setContext', key, value);
}

export async function executeDocumentSymbolProvider(
    uri: Uri,
): Promise<SymbolInformation[]> {
    try {
        const res = await commands.executeCommand<SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            uri,
        );
        console.log('executeDocumentSymbolProvider was successful');
        if (!res) {
            return [];
        }
        return res;
    } catch (e) {
        throw new Error(`Cannot fetch symbols of ${uri} : ${e}`);
    }
}

export async function executeLinkProvider(uri: Uri): Promise<DocumentLink[]> {
    try {
        const res = await commands.executeCommand<DocumentLink[]>(
            'vscode.executeLinkProvider',
            uri,
        );
        console.log('executeLinkProvider was successful');
        if (!res) {
            return [];
        }
        return res;
    } catch (e) {
        throw e;
        // throw new Error(`Cannot fetch symbols of ${uri} : ${e}`)
    }
}

function decorate(
    // tslint:disable-next-line: ban-types
    decorator: (fn: Function, key: string) => Function,
    // tslint:disable-next-line: ban-types
): Function {
    // tslint:disable-next-line: no-any
    return (_target: any, key: string, descriptor: any) => {
        let fnKey: string | null = null;
        // tslint:disable-next-line: ban-types
        let fn: Function | null = null;

        if (typeof descriptor.value === 'function') {
            fnKey = 'value';
            fn = descriptor.value;
        } else if (typeof descriptor.get === 'function') {
            fnKey = 'get';
            fn = descriptor.get;
        }

        if (!fn || !fnKey) {
            throw new Error('not supported');
        }

        const decorated = decorator(fn, key);
        if (
            !decorated ||
            typeof decorated !== 'function' ||
            decorated.toString() === 'null'
        ) {
            throw new Error(
                `util.decorate: ${decorator} returned invalid value for input (${fn}, ${key})`,
            );
        }
        descriptor[fnKey] = decorated;
        if (!descriptor[fnKey]) {
            throw new Error(`util.decorate: failed to set value`);
        }
    };
}

// tslint:disable-next-line: ban-types
export function profile(name: string): Function {
    // tslint:disable-next-line: ban-types
    return decorate((fn: Function, key: string): Function => {
        // tslint:disable-next-line: no-any
        return function timeTracked(this: any, ...args: any[]): any {
            const start = clock();
            // tslint:disable-next-line: no-any
            const res: any = fn.apply(this, args);

            if (res instanceof Promise) {
                return res.then(result => {
                    const ms = clock(start);
                    // console.log(`[perf] ${name}: `, ms, 'ms');
                    return result;
                });
            } else {
                const ms = clock(start);
                // console.log(`[perf] ${name}: `, ms, 'ms');
                return res;
            }
        };
    });
}

const nop = () => { };

// tslint:disable-next-line: ban-types
export function progress(name: string): Function {
    // tslint:disable-next-line: ban-types
    return decorate((fn: Function, _key: string): Function => {
        return function withProgress(
            this: any,
            ctx: Context,
            ...args: any[]
        ): Promise<any> {
            return ctx.subTask(name, ctx => fn.apply(this, [ctx, ...args]));
        };
    });
}

export function clock(start: [number, number]): number;
export function clock(): [number, number];
export function clock(
    start?: [number, number] | undefined,
): number | [number, number] {
    if (!start) {
        return process.hrtime();
    }
    const end = process.hrtime(start);
    return Math.round(end[0] * 1000 + end[1] / 1000000);
}

export abstract class Factory<T> {
    public get onChange(): Event<WorkspaceFolder> {
        return this._onChange.event;
    }
    private readonly _factorydisposable: Disposable;
    /**
     *
     * @param deps Dependencies.
     * @param _onChange
     */
    protected constructor(
        // tslint:disable-next-line: no-any
        deps: Array<Factory<any>>,
        private readonly _onChange: EventEmitter<
            WorkspaceFolder
        > = new EventEmitter(),
    ) {
        const disposables: Disposable[] = [];
        for (const dep of deps) {
            dep.onChange(this.notifyChange, this, disposables);
        }

        this._factorydisposable = Disposable.from(...disposables);
    }

    public abstract get(ctx: Context): Promise<T>;
    public dispose(): void {
        this._onChange.dispose();
        this._factorydisposable.dispose();
    }

    protected notifyChange(ws: WorkspaceFolder) {
        this._onChange.fire(ws);
    }
}

export abstract class CachingFactory<T> extends Factory<T> {
    private _cached: WeakMap<WorkspaceFolder, Promise<T>>;

    protected constructor(deps: Array<Factory<any>>) {
        super(deps);
        this._cached = new WeakMap();
    }

    public async get(ctx: Context): Promise<T> {
        let cached = this._cached.get(ctx.ws);
        if (cached !== undefined) {
            return cached;
        }
        cached = this.get_uncached(ctx);
        this._cached.set(ctx.ws, cached);
        return cached;
    }

    protected notifyChange(ws: WorkspaceFolder): void {
        super.notifyChange(ws);
        this._cached.delete(ws);
    }

    protected abstract get_uncached(ctx: Context): Promise<T>;
}

export interface ProcessOptions {
    readonly env?: Map<string, string>;
    /**
     * Defaults to 10 seconds.
     */
    readonly timeout?: number;
}

export interface ExecOpts {
    readonly noStderr: boolean;
}

export class ProcessBuilder {
    private logger?: (cmd: string) => void;

    constructor(
        private readonly ctx: Context,
        private readonly executable: string,
        private readonly args: string[],
        private readonly opts: ProcessOptions,
    ) { }

    public logWith(f: undefined | ((cmd: string) => void)): ProcessBuilder {
        this.logger = f;
        return this;
    }

    private get timeout(): number {
        if (this.opts.timeout !== undefined) {
            return this.opts.timeout;
        }

        return 10000;
    }

    public async spawn(): Promise<ChildProcess> {
        if (this.logger) {
            this.logger(`${this.command}`);
        }

        const cwd = await trueCasePath(this.ctx.ws.uri.fsPath);

        const p = spawn(this.executable, this.args, {
            cwd,
            env: this.opts.env,
        });

        p.stderr.setEncoding('utf8');

        // TODO: Timeout

        p.stdin.end();
        return p;
    }

    public exec(opts: { noStderr: true } & ExecOpts): Promise<string>;
    public exec(opts: ExecOpts): Promise<{ stdout: string; stderr: string }>;
    /**
     * @returns Returned promise will be resolved when child process is terminated.
     */
    public async exec(
        opts: ExecOpts,
    ): Promise<{ stdout: string; stderr: string } | string> {
        if (this.logger) {
            await this.logger(`${this.command}`);
        }

        const cwd = await trueCasePath(this.ctx.ws.uri.fsPath);

        const { stdout, stderr } = await new Promise<{
            stdout: string;
            stderr: string;
        }>((resolve, reject) => {
            execFile(
                this.executable,
                this.args,
                {
                    encoding: 'utf8',
                    timeout: this.timeout,
                    env: this.opts.env,
                    cwd,
                },
                (err, stdout: string, stderr: string): void => {
                    if (!!err) {
                        console.error(
                            `${
                            this.command
                            } failed: ${err}\nStdout: ${stdout}\nStdErr: ${stderr}`,
                        );
                        return reject(err);
                    }

                    resolve({ stdout, stderr });
                },
            );
        });

        if (opts.noStderr) {
            if (stderr) {
                console.error(
                    `${
                    this.command
                    } printed something on stderr.\nStdout: ${stdout}\nStdErr: ${stderr}`,
                );
                throw new Error(
                    `${
                    this.command
                    } printed something on stderr.\nStdout: ${stdout}\nStderr: ${stderr}`,
                );
            }
            return stdout;
        }

        return { stderr, stdout };
    }

    private get command(): string {
        return `${this.executable} ${this.args.join(' ')}`;
    }
}
