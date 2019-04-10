import * as assert from 'assert';

import * as wslpath from '../../utils/wslpath';

function mkConverterCheck(converter: (arg: string) => string) {
  return (from: string, to: string) => assert.equal(converter(from), to);
}

suite('WSL path conversion', () => {
  test('uriWindowsToWsl', () => {
    const check = mkConverterCheck(wslpath.uriWindowsToWsl);
    // Basic test
    check('C:\\Program Files\\somedir', '/c/Program Files/somedir');
    // Trailing slash
    check('C:\\Program Files\\somedir\\', '/c/Program Files/somedir/');
    // Different disk letter
    check('r:\\', '/r/');
    check('c:\\', '/c/');
  });
  test('uriWslToWindows', () => {
    const check = mkConverterCheck(wslpath.uriWslToWindows);

    // Basic test
    check('/c/Program Files/somedir', 'C:\\Program Files\\somedir');
    // Trailing slash
    check('/c/Program Files/somedir/', 'C:\\Program Files\\somedir\\');
    // In windows10 1903 access the linux filesystem beyond drvfs will return \\$wsl:\Distribution_Name\...
    check('/C/Some Directory', '\\\\wsl$\\Arch_Linux\\C\\Some Directory');
    // Different disk letter
    check('/c/', 'C:\\');
    check('/r/', 'R:\\');
  });
});
