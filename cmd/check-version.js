const { version } = require('../package');
const changelog = String(require('fs').readFileSync('CHANGELOG.md')).split('\n');
if (!changelog.find(line => line.startsWith('### ' + version))) {
  throw new Error(`The package.json version ${version} does not seem to have a matching heading in CHANGELOG.md`);
}
