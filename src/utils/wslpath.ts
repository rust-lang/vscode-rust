export function modifyParametersForWSL(command: string, args: string[]) {
  args.unshift(command);
  return {
    command: 'wsl',
    args,
  };
}

export function uriWslToWindows(wslUri: string, mountPoint: string): string {
  const uri = wslUri.startsWith(mountPoint)
    ? wslUri.substring(mountPoint.length)
    : wslUri;
  if (uri === '') {
    return '';
  }
  const uriSegments = uri.split('/');
  const diskLetter = uriSegments[0].toUpperCase();
  if (!/^[A-Z]+$/.test(diskLetter)) {
    return '';
  }
  uriSegments.shift(); // remove disk letter

  let uriWindows = diskLetter + ':';
  uriSegments.forEach(pathPart => {
    uriWindows += '\\' + pathPart;
  });

  if (uriWindows.length === 2) {
    uriWindows += '\\'; // case where we have C: in result but we want C:\
  }

  return uriWindows;
}

export function uriWindowsToWsl(
  windowsUri: string,
  mountPoint: string,
): string {
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

  let uriWsl = mountPoint + diskLetter;
  uriSegments.forEach(pathPart => {
    uriWsl += '/' + pathPart;
  });

  if (windowsUri[windowsUri.length - 1] === '\\') {
    uriWsl += '/';
  }

  return uriWsl;
}
