import { describe, it, expect, vi } from "vitest";

import { ReconcileWithGitStatus } from "../../../usecases/reconcileWithGitStatus";
import type { PersistedState } from "../../../adapters/storage/workspaceStateStore";
import type { GitClient } from "../../../adapters/git/gitClient";
import { SystemChangelist } from "../../../core/changelist/systemChangelist";
import { RenameMapping } from "../../../core/rename/renameMapping";

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
  status: Array<{ path: string; x: string; y: string; oldPath?: string }>,
  untracked: string[] = [],
): GitClient {
  return {
    getRepoRoot: vi.fn(async () => "/repo"),
    getStatusPorcelainZ: vi.fn(async () => status as any),
    getUntrackedPaths: vi.fn(async () => untracked),
    add: vi.fn(async () => {}),
    getGitDir: vi.fn(async () => "/repo/.git"),
    stashList: vi.fn(async () => []),
    stashPushPaths: vi.fn(async () => {}),
    stashApply: vi.fn(async () => {}),
    stashPop: vi.fn(async () => {}),
    stashDrop: vi.fn(async () => {}),
  } as any;
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

    const git = makeGit([{ path: "a.txt", x: " ", y: "M" }], []);
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

    const git = makeGit(
      [
        { path: "keep-d.txt", x: " ", y: "M" },
        { path: "keep-x.txt", x: "M", y: " " },
      ],
      ["keep-u.txt"],
    );

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

  it("moves untracked files with no existing owner to Unversioned", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
    };

    const git = makeGit([], ["u.txt"]);
    const store = makeStore(initial);

    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    const d = getList(saved, SystemChangelist.Default);

    expect(u.files).toContain("u.txt");
    expect(d.files).not.toContain("u.txt");
  });

  it("moves an untracked file from Default back to Unversioned", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["u.txt"],
        },
      ],
    };
  
    const git = makeGit([], ["u.txt"]);
    const store = makeStore(initial);
  
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");
  
    const saved = store.getState()!;
    const unversioned = getList(saved, SystemChangelist.Unversioned);
    const changes = getList(saved, SystemChangelist.Default);
  
    expect(unversioned.files).toContain("u.txt");
    expect(changes.files).not.toContain("u.txt");
  });

  it("keeps tracked changes in their existing owner list (unless owner is Unversioned)", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["a.txt"],
        },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_x", name: "X", files: ["b.txt"] },
      ],
    };

    const git = makeGit([
      { path: "a.txt", x: " ", y: "M" },
      { path: "b.txt", x: "M", y: " " },
    ], []);

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

    const git = makeGit(
      [
        { path: "c/d.txt", x: " ", y: "M" },
        { path: "a.txt", x: " ", y: "M" },
        { path: "b/u.txt", x: "?", y: "?" },
      ],
      ["b/u.txt"],
    );

    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    const d = getList(saved, SystemChangelist.Default);

    expect(u.files).toEqual(["b/u.txt"]);
    expect(d.files).toEqual(["a.txt", "c/d.txt"]);
  });

  it("forwards changelist membership when a file is renamed", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_x", name: "X", files: ["old.ts"] },
      ],
    };

    const git = makeGit(
      [{ path: "new.ts", x: "R", y: " ", oldPath: "old.ts" }],
      [],
    );

    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    const saved = store.getState()!;
    const x = getList(saved, "cl_x");
    const d = getList(saved, SystemChangelist.Default);

    expect(x.files).toContain("new.ts");
    expect(x.files).not.toContain("old.ts");
    expect(d.files).not.toContain("new.ts");
  });

  it("forwards membership for a rename in the Default list", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["old.ts"] },
      ],
    };

    const git = makeGit(
      [{ path: "new.ts", x: "R", y: " ", oldPath: "old.ts" }],
      [],
    );

    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    const saved = store.getState()!;
    const d = getList(saved, SystemChangelist.Default);

    expect(d.files).toContain("new.ts");
    expect(d.files).not.toContain("old.ts");
  });

  it("moves an untracked file from a custom changelist to Unversioned", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
        {
          id: "cl_x",
          name: "Feature",
          files: ["new.ts"],
        },
      ],
    };
  
    const git = makeGit([], ["new.ts"]);
    const store = makeStore(initial);
  
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");
  
    const saved = store.getState()!;
    const custom = getList(saved, "cl_x");
    const unversioned = getList(saved, SystemChangelist.Unversioned);
  
    expect(custom.files).not.toContain("new.ts");
    expect(unversioned.files).toContain("new.ts");
  });

  it("removes a stale untracked path that does not exist on disk", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: ["stale.txt"] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
    };

    // git ls-files says stale.txt is untracked (stale cache), but it's not on disk
    const git = makeGit([], ["stale.txt"]);
    const store = makeStore(initial);
    const existsOnDisk = vi.fn(async () => false);

    const uc = new ReconcileWithGitStatus(git, store as any, existsOnDisk);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    expect(u.files).not.toContain("stale.txt");
  });

  it("keeps a tracked deleted file (D status) even when it is not on disk", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["gone.txt"] },
      ],
    };

    // git reports gone.txt as worktree-deleted; file does not exist on disk
    const git = makeGit([{ path: "gone.txt", x: " ", y: "D" }], []);
    const store = makeStore(initial);
    const existsOnDisk = vi.fn(async () => false);

    const uc = new ReconcileWithGitStatus(git, store as any, existsOnDisk);
    await uc.run("/repo");

    const saved = store.getState()!;
    const d = getList(saved, SystemChangelist.Default);
    expect(d.files).toContain("gone.txt");
  });

  it("moves an untracked file from a custom changelist to Unversioned", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
        {
          id: "cl_x",
          name: "Feature",
          files: ["new.ts"],
        },
      ],
    };
  
    const git = makeGit([], ["new.ts"]);
    const store = makeStore(initial);
  
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");
  
    const saved = store.getState()!;
    const custom = getList(saved, "cl_x");
    const unversioned = getList(saved, SystemChangelist.Unversioned);
  
    expect(custom.files).not.toContain("new.ts");
    expect(unversioned.files).toContain("new.ts");
  });

  it("normalizes slashes in oldPath when matching rename", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_x", name: "X", files: ["src\\old.ts"] },
      ],
    };

    const git = makeGit(
      [{ path: "src/new.ts", x: "R", y: " ", oldPath: "src\\old.ts" }],
      [],
    );

    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    const saved = store.getState()!;
    const x = getList(saved, "cl_x");

    expect(x.files).toContain("src/new.ts");
    expect(x.files).not.toContain("src/old.ts");
    expect(x.files).not.toContain("src\\old.ts");
  });
});

describe("ReconcileWithGitStatus — after a rename has been staged", () => {
  it("moves the newly-staged path from Unversioned to Default", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: ["test-rn-1.txt"] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
    };

    const git = makeGit(
      [
        { path: "test.txt", x: "D", y: " " },
        { path: "test-rn-1.txt", x: "A", y: " " },
      ],
      [],
    );

    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    const d = getList(saved, SystemChangelist.Default);

    expect(u.files).not.toContain("test-rn-1.txt");
    expect(d.files).toContain("test-rn-1.txt");
  });
});

describe("ReconcileWithGitStatus — rename mapping pruning", () => {
  it("prunes a mapping entry once its oldPath no longer has a D status", async () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");

    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
    };

    // old.ts no longer appears at all — as if the rename was committed.
    const git = makeGit([], []);
    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any, undefined, mapping);
    await uc.run("/repo");

    expect(mapping.resolveOldPath("/repo", "new.ts")).toBeUndefined();
  });

  it("keeps a mapping entry while its oldPath still has a D status", async () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");

    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
    };

    const git = makeGit([{ path: "old.ts", x: " ", y: "D" }], []);
    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any, undefined, mapping);
    await uc.run("/repo");

    expect(mapping.resolveOldPath("/repo", "new.ts")).toBe("old.ts");
  });
});

describe("ReconcileWithGitStatus — rename target placement must not bounce to Unversioned", () => {
  it("keeps a rename destination already placed in Default by HandleFilesRenamed", async () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");

    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["new.ts"] },
      ],
    };

    const git = makeGit([{ path: "old.ts", x: " ", y: "D" }], ["new.ts"]);
    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any, undefined, mapping);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    const d = getList(saved, SystemChangelist.Default);

    expect(d.files).toContain("new.ts");
    expect(u.files).not.toContain("new.ts");
  });

  it("keeps a rename destination already placed in a custom changelist by HandleFilesRenamed", async () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");

    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "feature-a", name: "Feature A", files: ["new.ts"] },
      ],
    };

    const git = makeGit([{ path: "old.ts", x: " ", y: "D" }], ["new.ts"]);
    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any, undefined, mapping);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    const f = getList(saved, "feature-a");

    expect(f.files).toContain("new.ts");
    expect(u.files).not.toContain("new.ts");
  });

  it("still falls through to Unversioned when the rename was never placed anywhere", async () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");

    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
    };

    const git = makeGit([{ path: "old.ts", x: " ", y: "D" }], ["new.ts"]);
    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any, undefined, mapping);
    await uc.run("/repo");

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);

    expect(u.files).toContain("new.ts");
  });
});

describe("ReconcileWithGitStatus — mapping survives an explicit staged rename entry", () => {
  it("does not prune the mapping when status reports only a single R entry", async () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");

    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["new.ts"] },
      ],
    };

    const git = makeGit([{ path: "new.ts", x: "R", y: " ", oldPath: "old.ts" }], []);
    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any, undefined, mapping);
    await uc.run("/repo");

    expect(mapping.resolveOldPath("/repo", "new.ts")).toBe("old.ts");
  });
});

describe("ReconcileWithGitStatus — canonical rename-mapping synchronization", () => {
  it("hydrates RenameMapping from persisted renames before pruning, so an unstaged rename survives a reload", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["new.ts"] },
      ],
      renames: [{ oldPath: "old.ts", newPath: "new.ts" }],
    };

    // Fresh RenameMapping, as if the extension just reloaded. No R status
    // exists — an unstaged rename has no Git-level signal to rebuild from.
    const mapping = new RenameMapping();
    const git = makeGit([{ path: "old.ts", x: " ", y: "D" }], ["new.ts"]);
    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any, undefined, mapping);
    await uc.run("/repo");

    expect(mapping.resolveOldPath("/repo", "new.ts")).toBe("old.ts");

    const saved = store.getState()!;
    expect(saved.renames).toEqual([{ oldPath: "old.ts", newPath: "new.ts" }]);

    const d = getList(saved, SystemChangelist.Default);
    expect(d.files).toContain("new.ts");
  });

  it("reconstructs a rename from an explicit R status when RenameMapping is empty", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
    };

    const mapping = new RenameMapping();
    const git = makeGit([{ path: "new.ts", x: "R", y: " ", oldPath: "old.ts" }], []);
    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any, undefined, mapping);
    await uc.run("/repo");

    expect(mapping.resolveOldPath("/repo", "new.ts")).toBe("old.ts");
    expect(store.getState()!.renames).toEqual([
      { oldPath: "old.ts", newPath: "new.ts" },
    ]);
  });

  it("does not treat a copy (C) status as a rename", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["original.ts", "copy.ts"] },
      ],
    };

    const mapping = new RenameMapping();
    const git = makeGit(
      [
        { path: "copy.ts", x: "C", y: " ", oldPath: "original.ts" },
        { path: "original.ts", x: " ", y: "M" },
      ],
      [],
    );
    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any, undefined, mapping);
    await uc.run("/repo");

    expect(mapping.resolveOldPath("/repo", "copy.ts")).toBeUndefined();
    expect(store.getState()!.renames ?? []).toEqual([]);

    // Both sides remain their own independent entries — original.ts is not
    // discarded as if it were the "old side" of a rename.
    const d = getList(store.getState()!, SystemChangelist.Default);
    expect(d.files).toContain("original.ts");
    expect(d.files).toContain("copy.ts");
  });

  it("prunes the persisted renames entry once nothing references it anymore", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
      renames: [{ oldPath: "old.ts", newPath: "new.ts" }],
    };

    // Nothing in status mentions old.ts or new.ts at all — as if the rename
    // was committed (or reverted) since the last reconcile pass.
    const mapping = new RenameMapping();
    const git = makeGit([], []);
    const store = makeStore(initial);
    const uc = new ReconcileWithGitStatus(git, store as any, undefined, mapping);
    await uc.run("/repo");

    expect(mapping.resolveOldPath("/repo", "new.ts")).toBeUndefined();
    expect(store.getState()!.renames).toEqual([]);
  });
});
