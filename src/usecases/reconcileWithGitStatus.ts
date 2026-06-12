import * as path from "path";
import { GitClient } from "../adapters/git/gitClient";
import {
  PersistedState,
  WorkspaceStateStore,
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

type ListState = PersistedState["lists"][number];

export class ReconcileWithGitStatus {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly git: GitClient,
    private readonly store: WorkspaceStateStore,
    private readonly existsOnDisk: (absPath: string) => Promise<boolean> = async () => true,
  ) {}

  /**
   * Public API: safe to call many times quickly.
   * Calls are serialized so state can't be overwritten by an older run.
   */
  run(repoRoot: string): Promise<void> {
    this.chain = this.chain
      .catch(() => {
        // keep the chain alive even if a previous run failed
      })
      .then(() => this.runOnce(repoRoot));

    return this.chain;
  }

  private async runOnce(repoRoot: string): Promise<void> {
    const state = await this.store.load(repoRoot);
    if (!state || state.version !== 1) {
      return;
    }

    const fixed = ensureSystemLists(state);

    const status = await this.git.getStatusPorcelainZ(repoRoot);

    // Untracked paths — filter to those that actually exist on disk to avoid stale git cache
    const untrackedRaw = (await this.git.getUntrackedPaths(repoRoot)).map(norm);
    const liveUntracked = new Set<string>();
    for (const f of untrackedRaw) {
      if (await this.existsOnDisk(path.join(repoRoot, f))) {
        liveUntracked.add(f);
      }
    }

    const changed = new Set<string>();
    const renamedFrom = new Map<string, string>(); // oldPath -> newPath
    for (const e of status) {
      const p = norm(e.path);
      if (e.x === "?" && e.y === "?") {
        continue;
      }
      changed.add(p);
      if ((e.x === "R" || e.x === "C") && e.oldPath) {
        renamedFrom.set(norm(e.oldPath), p);
      }
    }

    const inStatus = new Set<string>([...liveUntracked, ...changed]);

    const fileOwner = new Map<string, string>();
    for (const list of fixed.lists) {
      for (const f of list.files.map(norm)) {
        if (!fileOwner.has(f)) {
          fileOwner.set(f, list.id);
        }
        const newPath = renamedFrom.get(f);
        if (newPath && !fileOwner.has(newPath)) {
          fileOwner.set(newPath, list.id);
        }
      }
    }

    // Build nextLists by pruning files no longer present in git status
    const nextLists: ListState[] = fixed.lists.map((l) => ({
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

    const removeEverywhere = (p: string) => {
      for (const l of nextLists) {
        l.files = l.files.filter((x) => x !== p);
      }
    };

    // Rule 1: untracked -> Unversioned, unless already placed by a rename event
    const unv = mustGet(SystemChangelist.Unversioned);
    for (const f of liveUntracked) {
      const owner = fileOwner.get(f);
      if (owner && owner !== SystemChangelist.Unversioned) {
        continue;
      }
      removeEverywhere(f);
      unv.files.push(f);
    }

    // Rule 2: tracked changes -> keep existing owner if not Unversioned, else Default
    const def = mustGet(SystemChangelist.Default);
    for (const f of changed) {
      removeEverywhere(f);

      const owner = fileOwner.get(f);
      if (owner && owner !== SystemChangelist.Unversioned) {
        mustGet(owner).files.push(f);
      } else {
        def.files.push(f);
      }
    }

    // De-dup + stable ordering
    for (const l of nextLists) {
      l.files = Array.from(new Set(l.files.map(norm))).sort();
    }

    // Save updated lists
    await this.store.save(repoRoot, { ...fixed, lists: nextLists });
  }
}
