import { describe, it, expect, vi } from "vitest";

import { RestoreFilesToChangelist } from "../../../../usecases/stash/restoreFilesToChangelist";
import type { PersistedState } from "../../../../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../../../../core/changelist/systemChangelist";

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

function stateWith(
  extra: PersistedState["lists"][number][],
  defFiles: string[] = [],
): PersistedState {
  return {
    version: 1,
    lists: [
      { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
      { id: SystemChangelist.Default, name: "Changes", files: defFiles },
      ...extra,
    ],
  };
}

describe("RestoreFilesToChangelist", () => {
  it("no-ops when filePaths is empty", async () => {
    const store = makeStore(stateWith([]));
    const uc = new RestoreFilesToChangelist(store as any);

    await uc.run("/repo", "Feature", []);

    expect(store.save).not.toHaveBeenCalled();
  });

  it("no-ops when state is missing or wrong version", async () => {
    const storeMissing = makeStore(undefined);
    const uc1 = new RestoreFilesToChangelist(storeMissing as any);
    await uc1.run("/repo", "Feature", ["a.ts"]);
    expect(storeMissing.save).not.toHaveBeenCalled();

    const storeWrong = makeStore({ version: 999 as any, lists: [] } as any);
    const uc2 = new RestoreFilesToChangelist(storeWrong as any);
    await uc2.run("/repo", "Feature", ["a.ts"]);
    expect(storeWrong.save).not.toHaveBeenCalled();
  });

  it("restores files to a named changelist when it exists", async () => {
    const store = makeStore(
      stateWith(
        [{ id: "cl_1", name: "Feature", files: [] }],
        ["a.ts", "b.ts"],
      ),
    );
    const uc = new RestoreFilesToChangelist(store as any);

    await uc.run("/repo", "Feature", ["a.ts"]);

    const saved = store.getState()!;
    const target = saved.lists.find((l) => l.id === "cl_1")!;
    const def = saved.lists.find((l) => l.id === SystemChangelist.Default)!;

    expect(target.files).toContain("a.ts");
    expect(def.files).not.toContain("a.ts");
    expect(def.files).toContain("b.ts");
  });

  it("falls back to Default when changelist name is not found", async () => {
    const store = makeStore(stateWith([], ["a.ts", "b.ts"]));
    const uc = new RestoreFilesToChangelist(store as any);

    await uc.run("/repo", "NonExistent", ["a.ts"]);

    const saved = store.getState()!;
    const def = saved.lists.find((l) => l.id === SystemChangelist.Default)!;
    expect(def.files).toContain("a.ts");
  });

  it("falls back to Default when changelistName is 'staged'", async () => {
    const store = makeStore(stateWith([], []));
    const uc = new RestoreFilesToChangelist(store as any);

    await uc.run("/repo", "staged", ["a.ts"]);

    const saved = store.getState()!;
    const def = saved.lists.find((l) => l.id === SystemChangelist.Default)!;
    expect(def.files).toContain("a.ts");
  });

  it("removes files from all other lists before restoring", async () => {
    const store = makeStore(
      stateWith(
        [
          { id: "cl_1", name: "Feature", files: [] },
          { id: "cl_2", name: "Other", files: ["a.ts"] },
        ],
        ["a.ts"],
      ),
    );
    const uc = new RestoreFilesToChangelist(store as any);

    await uc.run("/repo", "Feature", ["a.ts"]);

    const saved = store.getState()!;
    const feature = saved.lists.find((l) => l.id === "cl_1")!;
    const other = saved.lists.find((l) => l.id === "cl_2")!;
    const def = saved.lists.find((l) => l.id === SystemChangelist.Default)!;

    expect(feature.files).toContain("a.ts");
    expect(other.files).not.toContain("a.ts");
    expect(def.files).not.toContain("a.ts");
  });

  it("normalizes slashes, de-dups, and sorts", async () => {
    const store = makeStore(
      stateWith([{ id: "cl_1", name: "Feature", files: ["b.ts"] }]),
    );
    const uc = new RestoreFilesToChangelist(store as any);

    await uc.run("/repo", "Feature", ["src\\a.ts", "src/a.ts", "b.ts"]);

    const saved = store.getState()!;
    const feature = saved.lists.find((l) => l.id === "cl_1")!;

    expect(feature.files).toEqual(["b.ts", "src/a.ts"]);
  });

  it("is case-insensitive when matching changelist name", async () => {
    const store = makeStore(
      stateWith([{ id: "cl_1", name: "BACKEND", files: [] }]),
    );
    const uc = new RestoreFilesToChangelist(store as any);

    await uc.run("/repo", "backend", ["x.ts"]);

    const saved = store.getState()!;
    const target = saved.lists.find((l) => l.id === "cl_1")!;
    expect(target.files).toContain("x.ts");
  });
});
