import * as path from 'path';
// tslint:disable-next-line: no-implicit-dependencies
import { runTests } from 'vscode-test';

(async () => {
  const extensionPath = path.resolve(__dirname, '../../');
  const testRunnerPath = path.resolve(__dirname, './suite');

  await runTests({
    extensionPath,
    testRunnerPath,
  });
})();
