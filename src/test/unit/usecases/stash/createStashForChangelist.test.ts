import { describe, it, expect, vi } from "vitest";

import { CreateStashForChangelist } from "../../../../usecases/stash/createStashForChangelist";
import type { GitClient } from "../../../../adapters/git/gitClient";
import type { PersistedState } from "../../../../adapters/storage/workspaceStateStore";

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

describe("CreateStashForChangelist", () => {
  it("throws if changelist not found", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: "cl_other", name: "Other", files: ["a.txt"] }],
    } as any);

    const git = makeGit([]);
    const uc = new CreateStashForChangelist(git, store as any);

    await expect(
      uc.run({ repoRootFsPath: "/repo", changelistId: "cl_missing" }),
    ).rejects.toThrow("Changelist not found: cl_missing");

    expect(git.stashPushPaths).not.toHaveBeenCalled();
  });

  it("throws if changelist has no files", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: "cl_empty", name: "Empty", files: [] }],
    } as any);

    const git = makeGit([]);
    const uc = new CreateStashForChangelist(git, store as any);

    await expect(
      uc.run({ repoRootFsPath: "/repo", changelistId: "cl_empty" }),
    ).rejects.toThrow("This changelist has no files.");

    expect(git.stashPushPaths).not.toHaveBeenCalled();
  });

  it("filters out untracked files and stashes only tracked/changed ones", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        {
          id: "cl1",
          name: "CL1",
          files: ["tracked.txt", "untracked.md", "sub\\file.ts"],
        },
      ],
    } as any);

    const git = makeGit([{ path: "untracked.md", x: "?", y: "?" }]);

    const uc = new CreateStashForChangelist(git, store as any);

    const res = await uc.run({
      repoRootFsPath: "/repo",
      changelistId: "cl1",
      message: "WIP",
    });

    expect(git.stashPushPaths).toHaveBeenCalledTimes(1);
    expect(git.stashPushPaths).toHaveBeenCalledWith("/repo", "GW:cl1 WIP", [
      "tracked.txt",
      "sub/file.ts",
    ]);

    expect(res).toEqual({
      stashedCount: 2,
      skippedUntrackedCount: 1,
    });
  });

  it("throws if changelist contains only untracked files", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: "cl1", name: "CL1", files: ["a.txt", "b\\c.txt"] }],
    } as any);

    const git = makeGit([
      { path: "a.txt", x: "?", y: "?" },
      { path: "b/c.txt", x: "?", y: "?" },
    ]);

    const uc = new CreateStashForChangelist(git, store as any);

    await expect(
      uc.run({ repoRootFsPath: "/repo", changelistId: "cl1", message: "WIP" }),
    ).rejects.toThrow(
      "Nothing to stash (this changelist contains only untracked files).",
    );

    expect(git.stashPushPaths).not.toHaveBeenCalled();
  });

  it("uses default message when user message is missing/blank", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: "cl1", name: "CL1", files: ["a.txt"] }],
    } as any);

    const git = makeGit([]);
    const uc = new CreateStashForChangelist(git, store as any);

    const res = await uc.run({
      repoRootFsPath: "/repo",
      changelistId: "cl1",
      message: "   ",
    });

    expect(git.stashPushPaths).toHaveBeenCalledWith("/repo", "GW:cl1", [
      "a.txt",
    ]);
    expect(res).toEqual({ stashedCount: 1, skippedUntrackedCount: 0 });
  });

  it("treats status paths with backslashes as untracked too (normalizes both sides)", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: "cl1", name: "CL1", files: ["a\\b.txt", "keep.txt"] }],
    } as any);

    const git = makeGit([{ path: "a\\b.txt", x: "?", y: "?" }]);
    const uc = new CreateStashForChangelist(git, store as any);

    const res = await uc.run({
      repoRootFsPath: "/repo",
      changelistId: "cl1",
    });

    expect(git.stashPushPaths).toHaveBeenCalledWith("/repo", "GW:cl1", [
      "keep.txt",
    ]);
    expect(res).toEqual({ stashedCount: 1, skippedUntrackedCount: 1 });
  });
});
