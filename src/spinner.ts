import { window } from 'vscode';

export function startSpinner(prefix: string, postfix: string) {
  window.setStatusBarMessage(`${prefix} $(settings-gear~spin) ${postfix}`);
}

export function stopSpinner(message: string) {
  window.setStatusBarMessage(message);
}
