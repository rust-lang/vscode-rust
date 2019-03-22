import { window } from 'vscode';

export function startSpinner(prefix: string, postfix: string) {
  if (spinnerTimer != null) {
    clearInterval(spinnerTimer);
  }
  let state = 0;
  spinnerTimer = setInterval(() => {
    window.setStatusBarMessage(`${prefix} ${spinner[state]} ${postfix}`);
    state = (state + 1) % spinner.length;
  }, 100);
}

export function stopSpinner(message: string) {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
  }
  spinnerTimer = null;

  window.setStatusBarMessage(message);
}

let spinnerTimer: NodeJS.Timer | null = null;
const spinner = ['◐', '◓', '◑', '◒'];
