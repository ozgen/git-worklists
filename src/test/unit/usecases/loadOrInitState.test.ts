import { describe, it, expect, vi } from "vitest";

import { LoadOrInitState } from "../../../usecases/loadOrInitState";
import type { PersistedState } from "../../../adapters/storage/workspaceStateStore";
import type { GitClient } from "../../../adapters/git/gitClient";
import { SystemChangelist } from "../../../core/changelist/systemChangelist";

function makeGit(repoRoot = "/repo"): GitClient {
  return {
    getRepoRoot: vi.fn(async (_ws: string) => repoRoot),
    getStatusPorcelainZ: vi.fn(async () => [] as any),
    add: vi.fn(async () => {}),
    getGitDir: vi.fn(async () => `${repoRoot}/.git`),
    stashList: vi.fn(async () => []),
    stashPushPaths: vi.fn(async () => {}),
    stashApply: vi.fn(async () => {}),
    stashPop: vi.fn(async () => {}),
    stashDrop: vi.fn(async () => {}),
  };
}

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

describe("LoadOrInitState", () => {
  it("returns existing v1 state and does not save when system lists already exist", async () => {
    const existing: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["a.txt"] },
        { id: "cl_x", name: "X", files: ["b.txt"] },
      ],
    };

    const git = makeGit("/repo");
    const store = makeStore(existing);

    const uc = new LoadOrInitState(git, store as any);
    const res = await uc.run("/workspace");

    expect(res.repoRoot).toBe("/repo");
    expect(res.state).toBe(existing);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("ensures missing system lists in existing state and saves once", async () => {
    const existingMissing: PersistedState = {
      version: 1,
      lists: [{ id: "cl_x", name: "X", files: ["x.txt"] }],
    };

    const git = makeGit("/repo");
    const store = makeStore(existingMissing);

    const uc = new LoadOrInitState(git, store as any);
    const res = await uc.run("/workspace");

    expect(store.save).toHaveBeenCalledTimes(1);

    const saved = store.getState()!;
    expect(saved.version).toBe(1);
    expect(saved.lists.some((l) => l.id === SystemChangelist.Unversioned)).toBe(
      true,
    );
    expect(saved.lists.some((l) => l.id === SystemChangelist.Default)).toBe(
      true,
    );

    expect(saved.lists.some((l) => l.id === "cl_x")).toBe(true);

    expect(res.state).toEqual(saved);
  });

  it("initializes fresh state when store has no state", async () => {
    const git = makeGit("/repo");
    const store = makeStore(undefined);

    const uc = new LoadOrInitState(git, store as any);
    const res = await uc.run("/workspace");

    expect(store.save).toHaveBeenCalledTimes(1);

    expect(res.repoRoot).toBe("/repo");
    expect(res.state).toEqual({
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
    });
  });

  it("initializes fresh state when existing version is not 1", async () => {
    const git = makeGit("/repo");
    const store = makeStore({ version: 999 as any, lists: [] } as any);

    const uc = new LoadOrInitState(git, store as any);
    const res = await uc.run("/workspace");

    expect(store.save).toHaveBeenCalledTimes(1);
    expect(res.state.version).toBe(1);
    expect(res.state.lists.map((l) => l.id)).toEqual([
      SystemChangelist.Unversioned,
      SystemChangelist.Default,
    ]);
  });

  it("calls git.getRepoRoot with workspaceFsPath", async () => {
    const git = makeGit("/repo");
    const store = makeStore(undefined);

    const uc = new LoadOrInitState(git, store as any);
    await uc.run("/my/ws");

    expect(git.getRepoRoot).toHaveBeenCalledWith("/my/ws");
  });
});
