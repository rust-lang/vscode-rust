import { join } from 'path';

import { ProcessBuilder } from '../util';
import { Cli } from '../util/cli';
import { Context } from '../util/context';
import RustCfg from './cfg';

export default class Rustc extends Cli {
  constructor(private readonly ctx: Context, executable: string) {
    super(executable);
  }

  get sysroot(): Promise<string> {
    return new ProcessBuilder(
      this.ctx,
      this.executable,
      ['--print=sysroot'],
      {},
    )
      .exec({ noStderr: true })
      .then(v => v.replace('\r', '').replace('\n', ''));
  }

  get rustSrcPath(): Promise<string> {
    return this.sysroot.then(v => join(v, 'lib', 'rustlib', 'src', 'rust'));
  }

  get configs(): Promise<RustCfg[]> {
    return new ProcessBuilder(this.ctx, this.executable, ['--print=cfg'], {})
      .exec({ noStderr: true })
      .then(v =>
        v
          .replace('\r', '')
          .split('\n')
          .map(RustCfg.parse),
      );
  }
}

