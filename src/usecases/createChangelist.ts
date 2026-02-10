import {
  WorkspaceStateStore,
  PersistedState,
} from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";
import { randomUUID } from "crypto";

export class CreateChangelist {
  constructor(private readonly store: WorkspaceStateStore) {}

  async run(repoRoot: string, nameRaw: string): Promise<string> {
    const name = nameRaw.trim();
    if (!name) {
      throw new Error("Changelist name is empty.");
    }

    const state = await this.store.load(repoRoot);
    const current: PersistedState = ensureState(state);

    const reserved = new Set(["unversioned", "changes"]);
    if (reserved.has(name.toLowerCase())) {
      throw new Error("This name is reserved.");
    }

    const exists = current.lists.some(
      (l) => l.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      throw new Error("A changelist with this name already exists.");
    }

    const id = `cl_${randomUUID()}`;
    current.lists.push({ id, name, files: [] });

    await this.store.save(repoRoot, current);
    return id;
  }
}

function ensureState(state?: PersistedState): PersistedState {
  const s: PersistedState =
    state?.version === 1
      ? state
      : {
          version: 1,
          lists: [
            {
              id: SystemChangelist.Unversioned,
              name: "Unversioned",
              files: [],
            },
            { id: SystemChangelist.Default, name: "Changes", files: [] },
          ],
        };

  const hasU = s.lists.some((l) => l.id === SystemChangelist.Unversioned);
  const hasD = s.lists.some((l) => l.id === SystemChangelist.Default);

  if (!hasU) {
    s.lists.unshift({
      id: SystemChangelist.Unversioned,
      name: "Unversioned",
      files: [],
    });
  }
  if (!hasD) {
    s.lists.unshift({
      id: SystemChangelist.Default,
      name: "Changes",
      files: [],
    });
  }

  return s;
}
