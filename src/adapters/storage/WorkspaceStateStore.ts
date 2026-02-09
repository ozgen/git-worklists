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

/**
 * UI-only persisted state (checkbox selections).
 * Kept separate from PersistedState so we don't pollute changelist persistence.
 */
type PersistedSelectionState = {
  version: 1;
  selectedFiles: string[]; // repo-relative paths
};

export class WorkspaceStateStore {
  constructor(private readonly memento: vscode.Memento) {}

  private keyForRepo(repoRootFsPath: string): string {
    return `git-worklists.state.v1:${repoRootFsPath}`;
  }

  private selectionKeyForRepo(repoRootFsPath: string): string {
    return `git-worklists.selection.v1:${repoRootFsPath}`;
  }

  async load(repoRootFsPath: string): Promise<PersistedState | undefined> {
    return this.memento.get<PersistedState>(this.keyForRepo(repoRootFsPath));
  }

  async save(repoRootFsPath: string, state: PersistedState): Promise<void> {
    await this.memento.update(this.keyForRepo(repoRootFsPath), state);
  }

  getSelectedFiles(repoRootFsPath: string): Set<string> {
    const raw = this.memento.get<PersistedSelectionState>(
      this.selectionKeyForRepo(repoRootFsPath),
    );
    const arr = raw?.version === 1 ? raw.selectedFiles : [];
    return new Set(arr.map(normalizeRepoRelPath));
  }

  async setSelectedFiles(
    repoRootFsPath: string,
    selected: Set<string>,
  ): Promise<void> {
    const payload: PersistedSelectionState = {
      version: 1,
      selectedFiles: Array.from(selected).map(normalizeRepoRelPath).sort(),
    };
    await this.memento.update(
      this.selectionKeyForRepo(repoRootFsPath),
      payload,
    );
  }

  async toggleSelectedFile(
    repoRootFsPath: string,
    repoRelPath: string,
  ): Promise<boolean> {
    const current = this.getSelectedFiles(repoRootFsPath);
    const p = normalizeRepoRelPath(repoRelPath);

    if (current.has(p)) {
      current.delete(p);
      await this.setSelectedFiles(repoRootFsPath, current);
      return false;
    }

    current.add(p);
    await this.setSelectedFiles(repoRootFsPath, current);
    return true;
  }

  async clearSelectedFiles(repoRootFsPath: string): Promise<void> {
    await this.setSelectedFiles(repoRootFsPath, new Set());
  }
}

function normalizeRepoRelPath(p: string): string {
  return p.replace(/\\/g, "/");
}
