import * as child_process from 'child_process';
import * as util from 'util';

export const execFile = util.promisify(child_process.execFile);
