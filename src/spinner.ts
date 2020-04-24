import { window } from 'vscode';

export function startSpinner(message: string) {
  window.setStatusBarMessage(`RLS $(settings-gear~spin) ${message}`);
}

export function stopSpinner(message?: string) {
  window.setStatusBarMessage(`RLS ${message || ''}`);
}
