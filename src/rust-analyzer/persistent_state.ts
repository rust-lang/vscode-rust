import * as vscode from 'vscode';

export class PersistentState {
  constructor(private readonly globalState: vscode.Memento) {
    const { lastCheck, releaseId, releaseTag: serverVersion } = this;
    console.info('PersistentState:', { lastCheck, releaseId, serverVersion });
  }

  /**
   * Used to check for *nightly* updates once an hour.
   */
  get lastCheck(): number | undefined {
    return this.globalState.get('lastCheck');
  }
  async updateLastCheck(value: number) {
    await this.globalState.update('lastCheck', value);
  }

  /**
   * Release id of the *nightly* extension.
   * Used to check if we should update.
   */
  get releaseId(): number | undefined {
    return this.globalState.get('releaseId');
  }
  async updateReleaseId(value: number) {
    await this.globalState.update('releaseId', value);
  }

  /**
   * Release tag of the installed server.
   * Used to check if we need to update the server.
   */
  get releaseTag(): string | undefined {
    return this.globalState.get('releaseTag');
  }
  async updateReleaseTag(value: string | undefined) {
    await this.globalState.update('releaseTag', value);
  }
}
