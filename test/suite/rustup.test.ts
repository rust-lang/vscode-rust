import * as assert from 'assert';
import * as child_process from 'child_process';

import * as rustup from '../../src/rustup';

// We need to ensure that rustup works and is installed
const rustupVersion = child_process.execSync('rustup --version').toString();
assert(rustupVersion);

const config: rustup.RustupConfig = {
  path: 'rustup',
  channel: 'stable',
};

suite('Rustup Tests', () => {
  test('getVersion', async () => {
    const version = await rustup.getVersion(config);
    assert(rustupVersion.includes(`rustup ${version}`));
  });
  test('getActiveChannel', async () => {
    rustup.getActiveChannel('.', config);
  });
});
