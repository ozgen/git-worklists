import { PersistedState } from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";
import { ChangelistStore } from "./changelistStore";

export class RenameChangelist {
  constructor(private readonly store: ChangelistStore) {}

  async run(repoRoot: string, listId: string, nameRaw: string): Promise<void> {
    const name = nameRaw.trim();
    if (!name) {
      throw new Error("Changelist name is empty.");
    }

    if (
      listId === SystemChangelist.Default ||
      listId === SystemChangelist.Unversioned
    ) {
      throw new Error("System changelists cannot be renamed.");
    }

    const reserved = new Set(["unversioned", "changes"]);
    if (reserved.has(name.toLowerCase())) {
      throw new Error("This name is reserved.");
    }

    const state = await this.store.load(repoRoot);
    if (!state || state.version !== 1) {
      return;
    }

    const target = state.lists.find((l) => l.id === listId);
    if (!target) {
      return;
    }

    const duplicate = state.lists.find(
      (l) => l.id !== listId && l.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      throw new Error("A changelist with this name already exists.");
    }

    const next: PersistedState = {
      ...state,
      lists: state.lists.map((l) =>
        l.id === listId ? { ...l, name } : l,
      ),
    };

    await this.store.save(repoRoot, next);
  }
}
