import * as assert from 'assert';

import * as wslpath from '../../utils/wslpath';

function mkConverterCheck(converter: (arg: string) => string) {
  return (from: string, to: string) => assert.equal(converter(from), to);
}

suite('WSL path conversion', () => {
  test('uriWindowsToWsl', () => {
    const check = mkConverterCheck(wslpath.uriWindowsToWsl);
    // Basic test
    check('C:\\Program Files\\somedir', '/mnt/c/Program Files/somedir');
    // Trailing slash
    check('C:\\Program Files\\somedir\\', '/mnt/c/Program Files/somedir/');
    // Different disk letter
    check('z:\\', '/mnt/z/');
    check('C:\\', '/mnt/c/');
  });
  test('uriWslToWindows', () => {
    const check = mkConverterCheck(wslpath.uriWslToWindows);

    // Basic test
    check('/mnt/c/Program Files/somedir', 'C:\\Program Files\\somedir');
    // Trailing slash
    check('/mnt/c/Program Files/somedir/', 'C:\\Program Files\\somedir\\');
    // Uppercase drive letter
    check('/mnt/C/Some Directory', 'C:\\Some Directory');
    // FIXME: Should be `C:\\`? (single slash)
    check('/mnt/C/', 'C:\\\\');
    check('/mnt/z/', 'Z:\\\\');
  });
});
