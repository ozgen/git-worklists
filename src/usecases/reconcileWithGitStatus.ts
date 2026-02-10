import { GitClient } from "../adapters/git/gitClient";
import {
  WorkspaceStateStore,
  PersistedState,
} from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";

export class ReconcileWithGitStatus {
  constructor(
    private readonly git: GitClient,
    private readonly store: WorkspaceStateStore,
  ) {}

  async run(repoRoot: string): Promise<void> {
    const state = await this.store.load(repoRoot);
    if (!state || state.version !== 1) {
      return;
    }

    const status = await this.git.getStatusPorcelainZ(repoRoot);

    const untracked = new Set<string>();
    const changed = new Set<string>();

    for (const e of status) {
      if (e.x === "?" && e.y === "?") {
        untracked.add(e.path);
      } else {
        changed.add(e.path);
      }
    }

    // Build file -> listId (existing assignment)
    const fileOwner = new Map<string, string>();
    for (const list of state.lists) {
      for (const f of list.files) {
        if (!fileOwner.has(f)) {
          fileOwner.set(f, list.id);
        }
      }
    }

    const inStatus = new Set<string>([...untracked, ...changed]);

    // Remove files that are no longer in status.
    // IMPORTANT: Unversioned must contain ONLY untracked files.
    const nextLists = state.lists.map((l) => {
      let files = l.files.filter((f) => inStatus.has(f));

      if (l.id === SystemChangelist.Unversioned) {
        files = files.filter((f) => untracked.has(f));
      }

      return { ...l, files };
    });

    const byId = new Map(nextLists.map((l) => [l.id, l] as const));
    const mustGet = (id: string) => {
      const list = byId.get(id);
      if (!list) {
        throw new Error(`Missing list: ${id}`);
      }
      return list;
    };

    // Untracked always goes to Unversioned (and nowhere else)
    for (const f of untracked) {
      for (const l of nextLists) {
        if (l.id !== SystemChangelist.Unversioned) {
          l.files = l.files.filter((x) => x !== f);
        }
      }
      const u = mustGet(SystemChangelist.Unversioned);
      if (!u.files.includes(f)) {
        u.files.push(f);
      }
    }

    // Tracked changes: keep existing assignment EXCEPT "Unversioned".
    // If the old owner was Unversioned, treat as unassigned -> Default.
    for (const f of changed) {
      const owner = fileOwner.get(f);

      if (owner && owner !== SystemChangelist.Unversioned) {
        const l = mustGet(owner);
        if (!l.files.includes(f)) {
          l.files.push(f);
        }
      } else {
        const d = mustGet(SystemChangelist.Default);
        if (!d.files.includes(f)) {
          d.files.push(f);
        }
      }
    }

    // Stable output for UI
    for (const l of nextLists) {
      l.files = [...new Set(l.files)].sort();
    }

    const next: PersistedState = { ...state, lists: nextLists };
    await this.store.save(repoRoot, next);
  }
}
