import {
  WorkspaceStateStore,
  PersistedState,
} from "../adapters/storage/workspaceStateStore";

export class MoveFilesToChangelist {
  constructor(private readonly store: WorkspaceStateStore) {}

  async run(
    repoRoot: string,
    files: string[],
    targetListId: string,
  ): Promise<void> {
    const state = await this.store.load(repoRoot);
    if (!state || state.version !== 1) {
      return;
    }

    const toMove = new Set(
      files.map((p) => p.replace(/\\/g, "/")).filter(Boolean),
    );
    if (toMove.size === 0) {
      return;
    }

    // Remove from all lists
    const nextLists = state.lists.map((l) => ({
      ...l,
      files: l.files.filter((f) => !toMove.has(f)),
    }));

    const target = nextLists.find((l) => l.id === targetListId);
    if (!target) {
      throw new Error("Target changelist not found.");
    }

    for (const f of toMove) {
      if (!target.files.includes(f)) {
        target.files.push(f);
      }
    }
    target.files.sort();

    const next: PersistedState = { ...state, lists: nextLists };
    await this.store.save(repoRoot, next);
  }
}
