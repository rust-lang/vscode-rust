import { execSync } from 'child_process';

export function modifyParametersForWSL(command: string, args: string[]) {
  args.unshift(command);
  return {
    command: 'wsl',
    args,
  };
}

export function uriWslToWindows(wslUri: string): string {
  let windowsUri = execSync(`wsl.exe wslpath -w '${wslUri}'`, {
    encoding: 'utf8',
  });
  return windowsUri.trim();
}

export function uriWindowsToWsl(windowsUri: string): string {
  let wslUri = execSync(`wsl.exe wslpath -u '${windowsUri}'`, {
    encoding: 'utf8',
  });
  return wslUri.trim();
}
