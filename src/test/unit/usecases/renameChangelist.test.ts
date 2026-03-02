import { describe, it, expect, vi } from "vitest";

import { RenameChangelist } from "../../../usecases/renameChangelist";
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

function stateWith(extra: PersistedState["lists"][number][]): PersistedState {
  return {
    version: 1,
    lists: [
      { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
      { id: SystemChangelist.Default, name: "Changes", files: [] },
      ...extra,
    ],
  };
}

describe("RenameChangelist", () => {
  it("rejects empty name", async () => {
    const store = makeStore(stateWith([{ id: "cl_1", name: "Old", files: [] }]));
    const uc = new RenameChangelist(store as any);

    await expect(uc.run("/repo", "cl_1", "   ")).rejects.toThrow(
      "Changelist name is empty.",
    );
  });

  it("rejects renaming system changelists", async () => {
    const store = makeStore(stateWith([]));
    const uc = new RenameChangelist(store as any);

    await expect(
      uc.run("/repo", SystemChangelist.Default, "NewName"),
    ).rejects.toThrow("System changelists cannot be renamed.");

    await expect(
      uc.run("/repo", SystemChangelist.Unversioned, "NewName"),
    ).rejects.toThrow("System changelists cannot be renamed.");
  });

  it("rejects reserved names (case-insensitive)", async () => {
    const store = makeStore(stateWith([{ id: "cl_1", name: "Old", files: [] }]));
    const uc = new RenameChangelist(store as any);

    await expect(uc.run("/repo", "cl_1", "Changes")).rejects.toThrow(
      "This name is reserved.",
    );
    await expect(uc.run("/repo", "cl_1", "unversioned")).rejects.toThrow(
      "This name is reserved.",
    );
  });

  it("rejects duplicate name (case-insensitive)", async () => {
    const store = makeStore(
      stateWith([
        { id: "cl_1", name: "Backend", files: [] },
        { id: "cl_2", name: "Frontend", files: [] },
      ]),
    );
    const uc = new RenameChangelist(store as any);

    await expect(uc.run("/repo", "cl_1", "frontend")).rejects.toThrow(
      "A changelist with this name already exists.",
    );
  });

  it("allows renaming to same name (no-op effectively)", async () => {
    const store = makeStore(
      stateWith([{ id: "cl_1", name: "Backend", files: ["a.ts"] }]),
    );
    const uc = new RenameChangelist(store as any);

    await uc.run("/repo", "cl_1", "Backend");

    const saved = store.getState()!;
    const target = saved.lists.find((l) => l.id === "cl_1")!;
    expect(target.name).toBe("Backend");
    expect(target.files).toEqual(["a.ts"]);
  });

  it("renames the target list and preserves everything else", async () => {
    const store = makeStore(
      stateWith([
        { id: "cl_1", name: "Old Name", files: ["a.ts", "b.ts"] },
        { id: "cl_2", name: "Other", files: ["c.ts"] },
      ]),
    );
    const uc = new RenameChangelist(store as any);

    await uc.run("/repo", "cl_1", "New Name");

    expect(store.save).toHaveBeenCalledTimes(1);
    const saved = store.getState()!;

    const target = saved.lists.find((l) => l.id === "cl_1")!;
    expect(target.name).toBe("New Name");
    expect(target.files).toEqual(["a.ts", "b.ts"]);

    const other = saved.lists.find((l) => l.id === "cl_2")!;
    expect(other.name).toBe("Other");
    expect(other.files).toEqual(["c.ts"]);
  });

  it("no-ops if state is missing or wrong version", async () => {
    const storeMissing = makeStore(undefined);
    const uc1 = new RenameChangelist(storeMissing as any);
    await uc1.run("/repo", "cl_1", "X");
    expect(storeMissing.save).not.toHaveBeenCalled();

    const storeWrong = makeStore({ version: 999 as any, lists: [] } as any);
    const uc2 = new RenameChangelist(storeWrong as any);
    await uc2.run("/repo", "cl_1", "X");
    expect(storeWrong.save).not.toHaveBeenCalled();
  });

  it("no-ops if target list not found", async () => {
    const store = makeStore(stateWith([{ id: "cl_1", name: "A", files: [] }]));
    const uc = new RenameChangelist(store as any);

    await uc.run("/repo", "cl_missing", "NewName");

    expect(store.save).not.toHaveBeenCalled();
  });
});
