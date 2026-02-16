import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("crypto", () => {
  return {
    randomUUID: () => "uuid-123",
  };
});

import { CreateChangelist } from "../../../usecases/createChangelist";
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

describe("CreateChangelist", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("rejects empty name", async () => {
    const store = makeStore();
    const uc = new CreateChangelist(store as any);

    await expect(uc.run("/repo", "   ")).rejects.toThrow(
      "Changelist name is empty.",
    );
  });

  it("rejects reserved names (case-insensitive)", async () => {
    const store = makeStore();
    const uc = new CreateChangelist(store as any);

    await expect(uc.run("/repo", "Unversioned")).rejects.toThrow(
      "This name is reserved.",
    );
    await expect(uc.run("/repo", "changes")).rejects.toThrow(
      "This name is reserved.",
    );
  });

  it("creates new changelist when state is undefined (ensureState initializes system lists)", async () => {
    const store = makeStore(undefined);
    const uc = new CreateChangelist(store as any);

    const id = await uc.run("/repo", "My List");

    expect(id).toBe("cl_uuid-123");
    expect(store.save).toHaveBeenCalledTimes(1);

    const saved = store.getState()!;
    expect(saved.version).toBe(1);

    // system lists exist
    expect(saved.lists.some((l) => l.id === SystemChangelist.Unversioned)).toBe(
      true,
    );
    expect(saved.lists.some((l) => l.id === SystemChangelist.Default)).toBe(
      true,
    );

    // new list exists
    expect(
      saved.lists.some((l) => l.id === "cl_uuid-123" && l.name === "My List"),
    ).toBe(true);
  });

  it("rejects duplicate name (case-insensitive)", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_1", name: "Backend", files: [] },
      ],
    };

    const store = makeStore(initial);
    const uc = new CreateChangelist(store as any);

    await expect(uc.run("/repo", "backend")).rejects.toThrow(
      "A changelist with this name already exists.",
    );
  });

  it("adds missing system lists if state exists but is incomplete", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [{ id: "cl_1", name: "OnlyCustom", files: [] }], // missing system lists
    };

    const store = makeStore(initial);
    const uc = new CreateChangelist(store as any);

    const id = await uc.run("/repo", "X");

    expect(id).toBe("cl_uuid-123");

    const saved = store.getState()!;
    expect(saved.lists.some((l) => l.id === SystemChangelist.Unversioned)).toBe(
      true,
    );
    expect(saved.lists.some((l) => l.id === SystemChangelist.Default)).toBe(
      true,
    );
    expect(
      saved.lists.some((l) => l.id === "cl_uuid-123" && l.name === "X"),
    ).toBe(true);
  });
});
