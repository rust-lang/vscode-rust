export function modifyParametersForWSL(command: string, args: string[]) {
  args.unshift(command);
  return {
    command: 'wsl',
    args,
  };
}

export function uriWslToWindows(wslUri: string): string {
  const uriSegments = wslUri.split('/');
  if (
    uriSegments.length < 3 ||
    uriSegments[0].length !== 0 ||
    uriSegments[1] !== 'mnt'
  ) {
    return '';
  }
  uriSegments.shift();
  if (uriSegments[uriSegments.length - 1] === '') {
    uriSegments.pop();
  }

  const diskLetter = uriSegments[1].toUpperCase();
  if (!/^[A-Z]+$/.test(diskLetter)) {
    return '';
  }
  uriSegments.shift(); // remove mnt
  uriSegments.shift(); // remove disk letter

  let uriWindows = diskLetter + ':';
  uriSegments.forEach(pathPart => {
    uriWindows += '\\' + pathPart;
  });

  if (uriWindows.length === 2) {
    uriWindows += '\\'; // case where we have C: in result but we want C:\
  }

  if (wslUri[wslUri.length - 1] === '/') {
    uriWindows += '\\';
  }

  return uriWindows;
}

export function uriWindowsToWsl(windowsUri: string): string {
  const uriSegments = windowsUri.split('\\');
  if (uriSegments.length < 2) {
    return '';
  }

  if (uriSegments[uriSegments.length - 1] === '') {
    uriSegments.pop();
  }

  const diskLetter = uriSegments[0][0].toLowerCase();
  if (!/^[a-zA-Z]+$/.test(diskLetter)) {
    return '';
  }
  uriSegments.shift();

  let uriWsl = '/mnt/' + diskLetter;
  uriSegments.forEach(pathPart => {
    uriWsl += '/' + pathPart;
  });

  if (windowsUri[windowsUri.length - 1] === '\\') {
    uriWsl += '/';
  }

  return uriWsl;
}
