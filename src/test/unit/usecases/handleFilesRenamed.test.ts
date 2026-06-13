import { describe, it, expect, vi } from "vitest";

import { HandleFilesRenamed } from "../../../usecases/handleFilesRenamed";
import type { PersistedState } from "../../../adapters/storage/workspaceStateStore";
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

function getList(state: PersistedState, id: string) {
  const l = state.lists.find((x) => x.id === id);
  if (!l) {
    throw new Error(`Missing list in test: ${id}`);
  }
  return l;
}

describe("HandleFilesRenamed", () => {
  it("is a no-op when renames array is empty", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: SystemChangelist.Default, name: "Changes", files: ["a.ts"] }],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([]);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("is a no-op when state is missing", async () => {
    const store = makeStore(undefined);
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([{ oldRelPath: "a.ts", newRelPath: "b.ts" }]);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("is a no-op when no list contains the old path", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: SystemChangelist.Default, name: "Changes", files: ["other.ts"] }],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([{ oldRelPath: "a.ts", newRelPath: "b.ts" }]);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("renaming a file replaces the old path with the new path in the same changelist and does not keep both", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["test 2 copy.txt"] },
      ],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([{ oldRelPath: "test 2 copy.txt", newRelPath: "test.txt" }]);

    const saved = store.getState()!;
    const d = getList(saved, SystemChangelist.Default);
    expect(d.files).toEqual(["test.txt"]);
    expect(d.files).not.toContain("test 2 copy.txt");
  });

  it("does not produce duplicates when new path was already in the list", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["test 2 copy.txt", "test.txt"],
        },
      ],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([{ oldRelPath: "test 2 copy.txt", newRelPath: "test.txt" }]);

    const saved = store.getState()!;
    const d = getList(saved, SystemChangelist.Default);
    expect(d.files).toEqual(["test.txt"]);
  });

  it("replaces old path with new path in the same changelist", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_x", name: "Feature", files: ["src/a.ts", "src/b.ts"] },
      ],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([{ oldRelPath: "src/a.ts", newRelPath: "src/renamed.ts" }]);

    expect(store.save).toHaveBeenCalledTimes(1);
    const saved = store.getState()!;
    const x = getList(saved, "cl_x");
    expect(x.files).toContain("src/renamed.ts");
    expect(x.files).not.toContain("src/a.ts");
    expect(x.files).toContain("src/b.ts");
  });

  it("handles multiple renames in one call", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        { id: SystemChangelist.Default, name: "Changes", files: ["a.ts", "b.ts"] },
      ],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([
      { oldRelPath: "a.ts", newRelPath: "x.ts" },
      { oldRelPath: "b.ts", newRelPath: "y.ts" },
    ]);

    const saved = store.getState()!;
    const d = getList(saved, SystemChangelist.Default);
    expect(d.files).toEqual(["x.ts", "y.ts"]);
  });

  it("normalizes backslash paths when matching", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        { id: SystemChangelist.Default, name: "Changes", files: ["src\\old.ts"] },
      ],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([{ oldRelPath: "src/old.ts", newRelPath: "src/new.ts" }]);

    const saved = store.getState()!;
    const d = getList(saved, SystemChangelist.Default);
    expect(d.files).toContain("src/new.ts");
    expect(d.files).not.toContain("src/old.ts");
    expect(d.files).not.toContain("src\\old.ts");
  });

  it("does not call removeFromIndex or stageMany when oldPath is not staged", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: SystemChangelist.Default, name: "Changes", files: ["a.ts"] }],
    });
    const git = {
      getStagedPaths: vi.fn(async () => new Set<string>()),
      removeFromIndex: vi.fn(async () => {}),
      stageMany: vi.fn(async () => {}),
    };
    const uc = new HandleFilesRenamed(store as any, () => "/repo", git as any);
    await uc.run([{ oldRelPath: "a.ts", newRelPath: "b.ts" }]);
    expect(git.removeFromIndex).not.toHaveBeenCalled();
    expect(git.stageMany).not.toHaveBeenCalled();
  });

  it("calls removeFromIndex then stageMany with newPath when oldPath was staged", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: SystemChangelist.Default, name: "Changes", files: ["a.ts"] }],
    });
    const git = {
      getStagedPaths: vi.fn(async () => new Set(["a.ts"])),
      removeFromIndex: vi.fn(async () => {}),
      stageMany: vi.fn(async () => {}),
    };
    const uc = new HandleFilesRenamed(store as any, () => "/repo", git as any);
    await uc.run([{ oldRelPath: "a.ts", newRelPath: "b.ts" }]);
    expect(git.removeFromIndex).toHaveBeenCalledWith("/repo", ["a.ts"]);
    expect(git.stageMany).toHaveBeenCalledWith("/repo", ["b.ts"]);
  });

  it("stages only the pairs whose oldPath was staged when there are multiple renames", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: SystemChangelist.Default, name: "Changes", files: ["staged.ts", "unstaged.ts"] }],
    });
    const git = {
      getStagedPaths: vi.fn(async () => new Set(["staged.ts"])),
      removeFromIndex: vi.fn(async () => {}),
      stageMany: vi.fn(async () => {}),
    };
    const uc = new HandleFilesRenamed(store as any, () => "/repo", git as any);
    await uc.run([
      { oldRelPath: "staged.ts", newRelPath: "staged-new.ts" },
      { oldRelPath: "unstaged.ts", newRelPath: "unstaged-new.ts" },
    ]);
    expect(git.removeFromIndex).toHaveBeenCalledTimes(1);
    expect(git.removeFromIndex).toHaveBeenCalledWith("/repo", ["staged.ts"]);
    expect(git.stageMany).toHaveBeenCalledTimes(1);
    expect(git.stageMany).toHaveBeenCalledWith("/repo", ["staged-new.ts"]);
  });

  it("staged file in custom changelist renamed to new path stays in same custom changelist", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_test", name: "test", files: ["test2.txt"] },
      ],
    });
    const git = {
      getStagedPaths: vi.fn(async () => new Set(["test2.txt"])),
      removeFromIndex: vi.fn(async () => {}),
      stageMany: vi.fn(async () => {}),
    };
    const uc = new HandleFilesRenamed(store as any, () => "/repo", git as any);
    await uc.run([{ oldRelPath: "test2.txt", newRelPath: "test3.txt" }]);

    const saved = store.getState()!;
    const cl = getList(saved, "cl_test");
    expect(cl.files).toEqual(["test3.txt"]);
    expect(cl.files).not.toContain("test2.txt");
    expect(git.removeFromIndex).toHaveBeenCalledWith("/repo", ["test2.txt"]);
    expect(git.stageMany).toHaveBeenCalledWith("/repo", ["test3.txt"]);
  });

  it("Unversioned file rename keeps only newPath in Unversioned", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: ["old.txt"] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([{ oldRelPath: "old.txt", newRelPath: "new.txt" }]);

    const saved = store.getState()!;
    const u = getList(saved, SystemChangelist.Unversioned);
    expect(u.files).toEqual(["new.txt"]);
    expect(u.files).not.toContain("old.txt");
  });

  it("new path is removed from other lists when oldPath owner is a different list", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: ["new.txt"] },
        { id: SystemChangelist.Default, name: "Changes", files: ["old.txt"] },
      ],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([{ oldRelPath: "old.txt", newRelPath: "new.txt" }]);

    const saved = store.getState()!;
    const d = getList(saved, SystemChangelist.Default);
    const u = getList(saved, SystemChangelist.Unversioned);
    expect(d.files).toEqual(["new.txt"]);
    expect(u.files).not.toContain("new.txt");
  });

  it("old path is removed from all lists after rename", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["a.ts"] },
        { id: "cl_x", name: "Feature", files: ["b.ts"] },
      ],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([{ oldRelPath: "a.ts", newRelPath: "a-renamed.ts" }]);

    const saved = store.getState()!;
    for (const list of saved.lists) {
      expect(list.files).not.toContain("a.ts");
    }
    const d = getList(saved, SystemChangelist.Default);
    expect(d.files).toContain("a-renamed.ts");
  });

  it("does not save when nothing matched", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: SystemChangelist.Default, name: "Changes", files: ["z.ts"] }],
    });
    const uc = new HandleFilesRenamed(store as any, () => "/repo");
    await uc.run([{ oldRelPath: "nope.ts", newRelPath: "also-nope.ts" }]);
    expect(store.save).not.toHaveBeenCalled();
  });
});
