import { describe, it, expect, vi } from "vitest";

import { ReconcileWithGitStatus } from "../../../usecases/reconcileWithGitStatus";
import type { PersistedState } from "../../../adapters/storage/workspaceStateStore";
import type { GitClient } from "../../../adapters/git/gitClient";
import { SystemChangelist } from "../../../core/changelist/systemChangelist";

function makeStore(initial?: PersistedState) {
  let state = initial;

  return {
    load: vi.fn(async (_repoRoot: string) => state),
    save: vi.fn(async (_repoRoot: string, next: PersistedState) => {
      state = next;
    }),
    getState: () => state,
  };
}

function makeGit(
  status: Array<{ path: string; x: string; y: string }>,
): GitClient {
  return {
    getRepoRoot: vi.fn(async () => "/repo"),
    getStatusPorcelainZ: vi.fn(async () => status as any),
    add: vi.fn(async () => {}),
    getGitDir: vi.fn(async () => "/repo/.git"),
    stashList: vi.fn(async () => []),
    stashPushPaths: vi.fn(async () => {}),
    stashApply: vi.fn(async () => {}),
    stashPop: vi.fn(async () => {}),
    stashDrop: vi.fn(async () => {}),
  };
}

function getList(state: PersistedState, id: string) {
  const l = state.lists.find((x) => x.id === id);
  if (!l) {
    throw new Error(`Missing list in test: ${id}`);
  }
  return l;
}

describe("ReconcileWithGitStatus", () => {
  it("no-ops if state missing or wrong version", async () => {
    const git = makeGit([{ path: "a.txt", x: " ", y: "M" }]);

    const storeMissing = makeStore(undefined);
    const uc1 = new ReconcileWithGitStatus(git, storeMissing as any);
    await uc1.run("/repo");
    expect(storeMissing.save).not.toHaveBeenCalled();

    const storeWrong = makeStore({ version: 999 as any, lists: [] } as any);
    const uc2 = new ReconcileWithGitStatus(git, storeWrong as any);
    await uc2.run("/repo");
    expect(storeWrong.save).not.toHaveBeenCalled();
  });

  it("ensures system lists exist before saving", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [{ id: "cl_x", name: "X", files: ["a.txt"] }],
    };

    const git = makeGit([{ path: "a.txt", x: " ", y: "M" }]);
    const store = makeStore(initial);

    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    expect(store.save).toHaveBeenCalledTimes(1);
    const saved = store.getState()!;
    expect(saved.lists.some((l) => l.id === SystemChangelist.Unversioned)).toBe(
      true,
    );
    expect(saved.lists.some((l) => l.id === SystemChangelist.Default)).toBe(
      true,
    );
  });

  it("prunes files that are no longer in git status (from all lists)", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["stale-u.txt", "keep-u.txt"],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["stale-d.txt", "keep-d.txt"],
        },
        { id: "cl_x", name: "X", files: ["stale-x.txt", "keep-x.txt"] },
      ],
    };

    // only keep-* are in status
    const git = makeGit([
      { path: "keep-u.txt", x: "?", y: "?" }, // untracked
      { path: "keep-d.txt", x: " ", y: "M" }, // changed
      { path: "keep-x.txt", x: "M", y: " " }, // changed
    ]);

    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    const d = getList(saved, SystemChangelist.Default);
    const x = getList(saved, "cl_x");

    expect(u.files).not.toContain("stale-u.txt");
    expect(d.files).not.toContain("stale-d.txt");
    expect(x.files).not.toContain("stale-x.txt");
  });

  it("forces untracked files into Unversioned (removes from everywhere else)", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["u.txt"] },
        { id: "cl_x", name: "X", files: ["u.txt"] },
      ],
    };

    const git = makeGit([{ path: "u.txt", x: "?", y: "?" }]);
    const store = makeStore(initial);

    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    const d = getList(saved, SystemChangelist.Default);
    const x = getList(saved, "cl_x");

    expect(u.files).toEqual(["u.txt"]);
    expect(d.files).not.toContain("u.txt");
    expect(x.files).not.toContain("u.txt");
  });

  it("keeps tracked changes in their existing owner list (unless owner is Unversioned)", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["a.txt"],
        }, // owner=unversioned
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_x", name: "X", files: ["b.txt"] }, // owner=cl_x
      ],
    };

    const git = makeGit([
      { path: "a.txt", x: " ", y: "M" }, // changed -> owner is Unversioned => should go to Default
      { path: "b.txt", x: "M", y: " " }, // changed -> should stay in cl_x
    ]);

    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    const d = getList(saved, SystemChangelist.Default);
    const x = getList(saved, "cl_x");

    expect(u.files).not.toContain("a.txt");
    expect(d.files).toContain("a.txt");

    expect(x.files).toContain("b.txt");
    expect(d.files).not.toContain("b.txt");
  });

  it("normalizes slashes, de-dups, and sorts", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["b\\u.txt", "b/u.txt"],
        },
        { id: SystemChangelist.Default, name: "Changes", files: ["c\\d.txt"] },
      ],
    };

    const git = makeGit([
      { path: "b/u.txt", x: "?", y: "?" }, // untracked
      { path: "c/d.txt", x: " ", y: "M" }, // changed
      { path: "a.txt", x: " ", y: "M" }, // changed, not owned
    ]);

    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    const d = getList(saved, SystemChangelist.Default);

    expect(u.files).toEqual(["b/u.txt"]);

    expect(d.files).toEqual(["a.txt", "c/d.txt"]);
  });
});
