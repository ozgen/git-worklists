import { GitClient } from "../adapters/git/gitClient";
import {
  WorkspaceStateStore,
  PersistedState,
} from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";

function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

function ensureSystemLists(state: PersistedState): PersistedState {
  const hasUnv = state.lists.some((l) => l.id === SystemChangelist.Unversioned);
  const hasDef = state.lists.some((l) => l.id === SystemChangelist.Default);

  const lists = [...state.lists];

  if (!hasDef) {
    lists.unshift({ id: SystemChangelist.Default, name: "Changes", files: [] });
  }
  if (!hasUnv) {
    lists.unshift({
      id: SystemChangelist.Unversioned,
      name: "Unversioned",
      files: [],
    });
  }

  return { ...state, lists };
}

export class DeleteChangelist {
  constructor(
    private readonly git: GitClient,
    private readonly store: WorkspaceStateStore,
  ) {}

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

    const fixed = ensureSystemLists(state);

    const target = fixed.lists.find((l) => l.id === listId);
    if (!target) {
      return;
    }

    // Build status sets (same rules as reconcile)
    const status = await this.git.getStatusPorcelainZ(repoRoot);

    const untracked = new Set<string>();
    const changed = new Set<string>();

    for (const e of status) {
      const p = norm(e.path);
      if (e.x === "?" && e.y === "?") {
        untracked.add(p);
      } else {
        changed.add(p);
      }
    }

    const inStatus = new Set<string>([...untracked, ...changed]);

    // Remove the list; migrate only files that still exist in status
    const moved = target.files.map(norm);

    const nextLists = fixed.lists
      .filter((l) => l.id !== listId)
      .map((l) => ({ ...l, files: l.files.map(norm) }));

    const byId = new Map(nextLists.map((l) => [l.id, l] as const));
    const mustGet = (id: string) => {
      const l = byId.get(id);
      if (!l) {
        throw new Error(`Missing list: ${id}`);
      }
      return l;
    };

    const def = mustGet(SystemChangelist.Default);
    const unv = mustGet(SystemChangelist.Unversioned);

    for (const f of moved) {
      // stale path (renamed away, deleted, etc.) => drop
      if (!inStatus.has(f)) {
        continue;
      }

      if (untracked.has(f)) {
        unv.files.push(f);
      } else {
        def.files.push(f);
      } // tracked changes (staged/unstaged/renamed/deleted)
    }

    // de-dup + stable order
    for (const l of nextLists) {
      l.files = Array.from(new Set(l.files.map(norm))).sort();
    }

    await this.store.save(repoRoot, { ...fixed, lists: nextLists });
  }
}
