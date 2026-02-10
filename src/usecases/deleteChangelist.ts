import {
  WorkspaceStateStore,
  PersistedState,
} from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";

function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

export class DeleteChangelist {
  constructor(private readonly store: WorkspaceStateStore) {}

  async run(repoRoot: string, listId: string): Promise<void> {
    if (
      listId === SystemChangelist.Default ||
      listId === SystemChangelist.Unversioned
    ) {
      throw new Error("System changelists cannot be deleted.");
    }

    const state = await this.store.load(repoRoot);
    if (!state || state.version !== 1) {
      return;
    }

    const target = state.lists.find((l) => l.id === listId);
    if (!target) {
      return;
    }

    const defaultList = state.lists.find(
      (l) => l.id === SystemChangelist.Default,
    );
    if (!defaultList) {
      throw new Error("Default changelist is missing.");
    }

    // Move files to Default (avoid losing them from UI)
    for (const f of target.files.map(norm)) {
      if (!defaultList.files.includes(f)) {
        defaultList.files.push(f);
      }
    }
    defaultList.files = Array.from(new Set(defaultList.files.map(norm))).sort();

    // Remove the list
    const nextLists = state.lists.filter((l) => l.id !== listId);

    const next: PersistedState = { ...state, lists: nextLists };
    await this.store.save(repoRoot, next);
  }
}
