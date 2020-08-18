import * as glob from 'glob';
import * as Mocha from 'mocha';
import * as path from 'path';

export function run(
  testsRoot: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cb: (error: any, failures?: number) => void,
): void {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
  }).useColors(true);

  glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
    if (err) {
      return cb(err);
    }

    // Add files to the test suite
    files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

    try {
      // Run the mocha test
      mocha.run(failures => {
        cb(null, failures);
      });
    } catch (err) {
      cb(err);
    }
  });
}
