import * as path from 'path';
// tslint:disable-next-line: no-implicit-dependencies
import { runTests } from 'vscode-test';

(async () => {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, './suite');

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      '--disable-extensions',
      // Already start in the fixtures dir because we lose debugger connection
      // once we re-open a different folder due to window reloading
      path.join(extensionDevelopmentPath, 'fixtures'),
    ],
  }).catch(() => {
    console.error(`Test run failed`);
    process.exit(1);
  });
})();
