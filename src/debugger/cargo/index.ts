import * as JSONStream from 'jsonstream';

import { ProcessBuilder, progress } from '../util';
import { Cli } from '../util/cli';
import { Context } from '../util/context';
import { BuildOutput } from './build';

export default class Cargo extends Cli {
  @progress('Building executable')
  public async buildBinary(
    ctx: Context,
    check: boolean,
    flags: string[],
    opts: {
      // tslint:disable-next-line: no-any
      logWith?: (s: string) => any;
      // tslint:disable-next-line: no-any
      onStdout: (s: BuildOutput) => any;
      // tslint:disable-next-line: no-any
      onStderr: (s: string) => any;
    },
  ): Promise<void> {
    const base = check ? ['check'] : ['test', '--no-run'];

    const proc = await new ProcessBuilder(
      ctx,
      this.executable,
      [...base, '--message-format=json', ...flags],
      {},
    )
      .logWith(opts.logWith)
      .spawn();

    return new Promise<void>((resolve, reject) => {
      proc.stdout
        .pipe(JSONStream.parse(undefined))
        // tslint:disable-next-line: no-any
        .on('data', (data: any) => opts.onStdout(data as BuildOutput));

      proc.stderr.on('data', opts.onStderr);

      proc.once('error', reject);

      proc.once('exit', resolve);
    });
  }
}
