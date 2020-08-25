import * as vscode from 'vscode';

export interface Release {
  /**
   * ID of a release. Used to disambiguate between different releases under *moving* tags.
   */
  id: number;
  tag: string;
}

export class PersistentState {
  constructor(private readonly globalState: vscode.Memento) {
    const { lastCheck, installedRelease } = this;
    console.info('PersistentState:', { lastCheck, installedRelease });
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
   * Release tag of the installed server.
   * Used to check if we need to update the server.
   */
  get installedRelease(): Release | undefined {
    return this.globalState.get('installedRelease');
  }
  async updateInstalledRelease(value: Release | undefined) {
    return this.globalState.update('installedRelease', value);
  }
}
