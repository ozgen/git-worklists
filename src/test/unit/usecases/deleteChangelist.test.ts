import { describe, it, expect, vi } from "vitest";

import { DeleteChangelist } from "../../../usecases/deleteChangelist";
import type { PersistedState } from "../../../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../../../core/changelist/systemChangelist";
import type { GitClient } from "../../../adapters/git/gitClient";
import { ChangelistStore } from "../../../usecases/changelistStore";

function makeStore(
  initial?: PersistedState,
): ChangelistStore & { getState(): PersistedState | undefined } {
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
    tryGetRepoRoot: vi.fn(async () => "/repo"),
    getStatusPorcelainZ: vi.fn(async () => status as any),
    add: vi.fn(async () => {}),
    stageMany: vi.fn(async () => {}),
    unstageMany: vi.fn(async () => {}),
    isIgnored: vi.fn(async () => false),
    getGitDir: vi.fn(async () => "/repo/.git"),
    showFileAtRef: vi.fn(async () => "mock-file-content"),
    stashList: vi.fn(async () => []),
    stashPushPaths: vi.fn(async () => {}),
    stashApply: vi.fn(async () => {}),
    stashPop: vi.fn(async () => {}),
    stashDrop: vi.fn(async () => {}),
  };
}


describe("DeleteChangelist", () => {
  it("rejects deleting system changelists", async () => {
    const store = makeStore();
    const git = makeGit([]);

    const uc = new DeleteChangelist(git, store);

    await expect(uc.run("/repo", SystemChangelist.Default)).rejects.toThrow(
      "System changelists cannot be deleted.",
    );
    await expect(uc.run("/repo", SystemChangelist.Unversioned)).rejects.toThrow(
      "System changelists cannot be deleted.",
    );
  });

  it("no-ops if state missing or wrong version", async () => {
    const git = makeGit([]);

    const storeMissing = makeStore(undefined);
    const uc1 = new DeleteChangelist(git, storeMissing);
    await uc1.run("/repo", "cl_x");
    expect((storeMissing.save as any).mock.calls.length).toBe(0);

    const storeWrong = makeStore({ version: 999 as any, lists: [] } as any);
    const uc2 = new DeleteChangelist(git, storeWrong);
    await uc2.run("/repo", "cl_x");
    expect((storeWrong.save as any).mock.calls.length).toBe(0);
  });

  it("no-ops if target list not found", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_a", name: "A", files: ["a.txt"] },
      ],
    };

    const store = makeStore(initial);
    const git = makeGit([{ path: "a.txt", x: " ", y: "M" }]);

    const uc = new DeleteChangelist(git, store);
    await uc.run("/repo", "cl_missing");

    expect((store.save as any).mock.calls.length).toBe(0);
  });

  it("removes custom list and migrates only files that are still in status", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["keep-unv.txt"],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["keep-def.txt"],
        },

        {
          id: "cl_del",
          name: "ToDelete",
          files: [
            "tracked1.txt", // in changed => goes to Changes
            "untracked1.txt", // in untracked => goes to Unversioned
            "stale.txt", // not in status => dropped
            "dup\\path.txt", // duplicates normalize
            "dup/path.txt",
          ],
        },

        { id: "cl_other", name: "Other", files: ["x\\y.txt"] },
      ],
    };

    const git = makeGit([
      { path: "tracked1.txt", x: "M", y: " " }, // changed
      { path: "untracked1.txt", x: "?", y: "?" }, // untracked
      { path: "dup/path.txt", x: " ", y: "M" }, // changed
      { path: "x/y.txt", x: " ", y: "M" }, // other list file exists
    ]);

    const store = makeStore(initial);
    const uc = new DeleteChangelist(git, store);

    await uc.run("/repo", "cl_del");

    expect((store.save as any).mock.calls.length).toBe(1);

    const saved = store.getState()!;
    const ids = saved.lists.map((l) => l.id);

    expect(ids).not.toContain("cl_del");
    expect(ids).toContain(SystemChangelist.Default);
    expect(ids).toContain(SystemChangelist.Unversioned);

    const def = saved.lists.find((l) => l.id === SystemChangelist.Default)!;
    const unv = saved.lists.find((l) => l.id === SystemChangelist.Unversioned)!;
    const other = saved.lists.find((l) => l.id === "cl_other")!;

    // migrated
    expect(def.files).toContain("tracked1.txt");
    expect(def.files).toContain("dup/path.txt");
    expect(unv.files).toContain("untracked1.txt");

    // stale dropped
    expect(def.files).not.toContain("stale.txt");
    expect(unv.files).not.toContain("stale.txt");

    // normalized + deduped + sorted
    expect(def.files).toEqual([...def.files].slice().sort());
    expect(new Set(def.files).size).toBe(def.files.length);

    // other list normalized too (the code normalizes all lists)
    expect(other.files).toEqual(["x/y.txt"]);
  });

  it("adds missing system lists if persisted state forgot them", async () => {
    const initial: PersistedState = {
      version: 1,
      lists: [{ id: "cl_del", name: "ToDelete", files: ["a.txt"] }],
    };

    const git = makeGit([{ path: "a.txt", x: " ", y: "M" }]);
    const store = makeStore(initial);

    const uc = new DeleteChangelist(git, store);
    await uc.run("/repo", "cl_del");

    const saved = store.getState()!;
    expect(saved.lists.some((l) => l.id === SystemChangelist.Default)).toBe(
      true,
    );
    expect(saved.lists.some((l) => l.id === SystemChangelist.Unversioned)).toBe(
      true,
    );

    const def = saved.lists.find((l) => l.id === SystemChangelist.Default)!;
    expect(def.files).toContain("a.txt");
  });
});
