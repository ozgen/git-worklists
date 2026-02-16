import { describe, it, expect, vi } from "vitest";

import { MoveFilesToChangelist } from "../../../usecases/moveFilesToChangelist";
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

describe("MoveFilesToChangelist", () => {
  it("no-ops if state missing or wrong version", async () => {
    const storeMissing = makeStore(undefined);
    const uc1 = new MoveFilesToChangelist(storeMissing as any);
    await uc1.run("/repo", ["a.txt"], "cl_x");
    expect(storeMissing.save).not.toHaveBeenCalled();

    const storeWrong = makeStore({ version: 999 as any, lists: [] } as any);
    const uc2 = new MoveFilesToChangelist(storeWrong as any);
    await uc2.run("/repo", ["a.txt"], "cl_x");
    expect(storeWrong.save).not.toHaveBeenCalled();
  });

  it("no-ops if files list is empty or only empty strings", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["a.txt"],
        },
        { id: SystemChangelist.Default, name: "Changes", files: ["b.txt"] },
        { id: "cl_x", name: "X", files: [] },
      ],
    };

    const store = makeStore(initial);
    const uc = new MoveFilesToChangelist(store as any);

    await uc.run("/repo", [], "cl_x");
    await uc.run("/repo", ["", ""], "cl_x");

    expect(store.save).not.toHaveBeenCalled();
    expect(store.getState()).toEqual(initial);
  });

  it("throws if target changelist does not exist", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [{ id: "cl_a", name: "A", files: ["a.txt"] }],
    };

    const store = makeStore(initial);
    const uc = new MoveFilesToChangelist(store as any);

    await expect(uc.run("/repo", ["a.txt"], "missing")).rejects.toThrow(
      "Target changelist not found.",
    );
    expect(store.save).not.toHaveBeenCalled();
  });

  it("removes files from all lists and adds to target (dedup + sort + normalize)", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: "cl_a", name: "A", files: ["a.txt", "c.txt", "dup.txt"] },
        { id: "cl_b", name: "B", files: ["b.txt", "dup.txt"] },
        { id: "cl_t", name: "Target", files: ["z.txt", "a.txt"] },
      ],
    };

    const store = makeStore(initial);
    const uc = new MoveFilesToChangelist(store as any);

    await uc.run("/repo", ["b.txt", "dup.txt", "new.txt"], "cl_t");

    expect(store.save).toHaveBeenCalledTimes(1);

    const saved = store.getState()!;
    const a = saved.lists.find((l) => l.id === "cl_a")!;
    const b = saved.lists.find((l) => l.id === "cl_b")!;
    const t = saved.lists.find((l) => l.id === "cl_t")!;

    expect(a.files).toEqual(["a.txt", "c.txt"]);
    expect(b.files).toEqual([]);
    expect(t.files).toEqual(["a.txt", "b.txt", "dup.txt", "new.txt", "z.txt"]);
  });

  it("does not re-add files already present in target", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: "cl_src", name: "Src", files: ["a.txt"] },
        { id: "cl_t", name: "Target", files: ["a.txt"] },
      ],
    };

    const store = makeStore(initial);
    const uc = new MoveFilesToChangelist(store as any);

    await uc.run("/repo", ["a.txt"], "cl_t");

    const saved = store.getState()!;
    const t = saved.lists.find((l) => l.id === "cl_t")!;
    expect(t.files).toEqual(["a.txt"]);
  });
});
