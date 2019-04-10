import * as assert from 'assert';

import * as wslpath from '../../utils/wslpath';

function mkConverterCheck(converter: (arg: string, m: string) => string) {
  return (from: string, to: string) => assert.equal(converter(from, '/'), to);
}

suite('WSL path conversion', () => {
  test('uriWindowsToWsl', () => {
    const check = mkConverterCheck(wslpath.uriWindowsToWsl);
    // Basic test
    check('C:\\Program Files\\somedir', '/c/Program Files/somedir');
    // Trailing slash
    check('C:\\Program Files\\somedir\\', '/c/Program Files/somedir/');
    // Different disk letter
    check('z:\\', '/z/');
    check('C:\\', '/c/');
  });
  test('uriWslToWindows', () => {
    const check = mkConverterCheck(wslpath.uriWslToWindows);

    // Basic test
    check('/c/Program Files/somedir', 'C:\\Program Files\\somedir');
    // Trailing slash
    check('/c/Program Files/somedir/', 'C:\\Program Files\\somedir\\');
    // Uppercase drive letter
    check('/C/Some Directory', 'C:\\Some Directory');
    // FIXME: Should be `C:\\`? (single slash)
    check('/C/', 'C:\\');
    check('/z/', 'Z:\\');
  });
});
