import * as path from 'path';
// tslint:disable-next-line: no-implicit-dependencies
import { runTests } from 'vscode-test';

(async () => {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite');

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-extensions'],
  }).catch(() => {
    console.error(`Test run failed`);
    process.exit(1);
  });
})();
