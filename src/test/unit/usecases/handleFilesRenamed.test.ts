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

  it("does not call stageMany when oldPath is not staged", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: SystemChangelist.Default, name: "Changes", files: ["a.ts"] }],
    });
    const git = {
      getStagedPaths: vi.fn(async () => new Set<string>()),
      stageMany: vi.fn(async () => {}),
    };
    const uc = new HandleFilesRenamed(store as any, () => "/repo", git as any);
    await uc.run([{ oldRelPath: "a.ts", newRelPath: "b.ts" }]);
    expect(git.stageMany).not.toHaveBeenCalled();
  });

  it("calls stageMany with [oldPath, newPath] when oldPath was staged", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: SystemChangelist.Default, name: "Changes", files: ["a.ts"] }],
    });
    const git = {
      getStagedPaths: vi.fn(async () => new Set(["a.ts"])),
      stageMany: vi.fn(async () => {}),
    };
    const uc = new HandleFilesRenamed(store as any, () => "/repo", git as any);
    await uc.run([{ oldRelPath: "a.ts", newRelPath: "b.ts" }]);
    expect(git.stageMany).toHaveBeenCalledWith("/repo", ["a.ts", "b.ts"]);
  });

  it("stages only the pairs whose oldPath was staged when there are multiple renames", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: SystemChangelist.Default, name: "Changes", files: ["staged.ts", "unstaged.ts"] }],
    });
    const git = {
      getStagedPaths: vi.fn(async () => new Set(["staged.ts"])),
      stageMany: vi.fn(async () => {}),
    };
    const uc = new HandleFilesRenamed(store as any, () => "/repo", git as any);
    await uc.run([
      { oldRelPath: "staged.ts", newRelPath: "staged-new.ts" },
      { oldRelPath: "unstaged.ts", newRelPath: "unstaged-new.ts" },
    ]);
    expect(git.stageMany).toHaveBeenCalledTimes(1);
    expect(git.stageMany).toHaveBeenCalledWith("/repo", ["staged.ts", "staged-new.ts"]);
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
