import { window } from 'vscode';

export function startSpinner(message: string) {
  window.setStatusBarMessage(`Rust: $(settings-gear~spin) ${message}`);
}

export function stopSpinner(message?: string) {
  window.setStatusBarMessage(message ? `Rust: ${message}` : 'Rust');
}
