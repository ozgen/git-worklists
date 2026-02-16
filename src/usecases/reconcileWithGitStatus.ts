import { GitClient } from "../adapters/git/gitClient";
import {
  WorkspaceStateStore,
  PersistedState,
} from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";
import { getUntrackedPaths } from "../utils/process";

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

    const fixed = ensureSystemLists(state);

    const status = await this.git.getStatusPorcelainZ(repoRoot);

    const untracked = new Set<string>(
      (await getUntrackedPaths(repoRoot)).map(norm),
    );

    const changed = new Set<string>();

    for (const e of status) {
      const p = norm(e.path);

      if (e.x === "?" && e.y === "?") {
        continue;
      }

      changed.add(p);
    }

    const inStatus = new Set<string>([...untracked, ...changed]);

    // map file -> current owner list (first match wins)
    const fileOwner = new Map<string, string>();
    for (const list of fixed.lists) {
      for (const f of list.files.map(norm)) {
        if (!fileOwner.has(f)) {
          fileOwner.set(f, list.id);
        }
      }
    }

    // prune: remove everything that is no longer in git status (from ALL lists)
    const nextLists = fixed.lists.map((l) => ({
      ...l,
      files: l.files.map(norm).filter((f) => inStatus.has(f)),
    }));

    const byId = new Map(nextLists.map((l) => [l.id, l] as const));
    const mustGet = (id: string) => {
      const l = byId.get(id);
      if (!l) {
        throw new Error(`Missing list: ${id}`);
      }
      return l;
    };

    // helper: remove file from all lists
    const removeEverywhere = (p: string) => {
      for (const l of nextLists) {
        l.files = l.files.filter((x) => x !== p);
      }
    };

    // enforce: untracked ALWAYS goes to Unversioned
    for (const f of untracked) {
      removeEverywhere(f);
      const u = mustGet(SystemChangelist.Unversioned);
      u.files.push(f);
    }

    // tracked changes: keep owner if it's not Unversioned, else Default
    for (const f of changed) {
      removeEverywhere(f);

      const owner = fileOwner.get(f);
      if (owner && owner !== SystemChangelist.Unversioned) {
        mustGet(owner).files.push(f);
      } else {
        mustGet(SystemChangelist.Default).files.push(f);
      }
    }

    // de-dup + stable order
    for (const l of nextLists) {
      l.files = Array.from(new Set(l.files.map(norm))).sort();
    }

    await this.store.save(repoRoot, { ...fixed, lists: nextLists });
  }
}
