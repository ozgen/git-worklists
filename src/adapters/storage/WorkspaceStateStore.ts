import * as vscode from "vscode";

export type PersistedChangelist = {
  id: string;
  name: string;
  files: string[];
};

export type PersistedState = {
  version: 1;
  lists: PersistedChangelist[];
};

export class WorkspaceStateStore {
  constructor(private readonly memento: vscode.Memento) {}

  private keyForRepo(repoRootFsPath: string): string {
    return `git-worklists.state.v1:${repoRootFsPath}`;
  }

  async load(repoRootFsPath: string): Promise<PersistedState | undefined> {
    return this.memento.get<PersistedState>(this.keyForRepo(repoRootFsPath));
  }

  async save(repoRootFsPath: string, state: PersistedState): Promise<void> {
    await this.memento.update(this.keyForRepo(repoRootFsPath), state);
  }
}
