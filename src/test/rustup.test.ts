import * as assert from 'assert';
import * as child_process from 'child_process';

import * as rustup from '../rustup';

// TODO: Detect if we're running in Windows and if wsl works?
// We need to ensure that rustup works and is installed
assert(child_process.execSync('rustup --version'));

const config: rustup.RustupConfig = {
  path: 'rustup',
  channel: 'stable',
  useWSL: false,
};

suite('Rustup Tests', () => {
  test('getActiveChannel', async () => {
    const activeChannel = rustup.getActiveChannel('.', config);
    console.log(activeChannel);
  });
});
