import { describe, expect, it, vi } from "vitest";

import type { GitClient } from "../../../../adapters/git/gitClient";
import type { PersistedState } from "../../../../adapters/storage/workspaceStateStore";
import { CreateStashForChangelist } from "../../../../usecases/stash/createStashForChangelist";
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
    tryGetRepoRoot: vi.fn(),
    isIgnored: vi.fn(),
    showFileAtRef: vi.fn(),
    stageMany: vi.fn(async () => {}),
    unstageMany: vi.fn(async () => {}),
    getUpstreamRef: vi.fn(async () => ""),
    listOutgoingCommits: vi.fn(async () => []),

    getCommitFiles: vi.fn(async () => []),
    showFileAtRefOptional: vi.fn(
      async (
        _repoRootFsPath: string,
        _ref: string,
        _repoRelativePath: string,
      ) => "",
    ),
    tryGetUpstreamRef: vi.fn(async () => ""),
    stashListFiles: vi.fn(async () => []),

    getStagedPaths: vi.fn(async () => new Set<string>()),
    getFileStageStates: vi.fn(async () => new Map()),
    getDiffUnstaged: vi.fn(async () => ""),
    applyPatchStaged: vi.fn(async () => {}),
    getUntrackedPaths: vi.fn(async () => []),
    isNewFileInRepo: vi.fn(async () => false),
    fileExistsAtRef: vi.fn(async () => false),
    getHeadMessage: vi.fn(async () => ""),
    isHeadEmptyVsParent: vi.fn(async () => false),
    commit: vi.fn(async () => {}),
    push: vi.fn(async () => {}),
    discardFiles: vi.fn(async () => {}),
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

  it("throws if changelist has no valid name", async () => {
    const store = makeStore({
      version: 1,
      lists: [{ id: "cl1", name: "   ", files: ["a.txt"] }],
    } as any);

    const git = makeGit([]);
    const uc = new CreateStashForChangelist(git, store as any);

    await expect(
      uc.run({ repoRootFsPath: "/repo", changelistId: "cl1" }),
    ).rejects.toThrow("Changelist has no valid name.");

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
    expect(git.stashPushPaths).toHaveBeenCalledWith(
      "/repo",
      "GW:CL1 WIP",
      ["tracked.txt", "sub/file.ts"],
      { includeUntracked: false },
    );

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

    expect(git.stashPushPaths).toHaveBeenCalledWith(
      "/repo",
      "GW:CL1",
      ["a.txt"],
      { includeUntracked: false },
    );
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

    expect(git.stashPushPaths).toHaveBeenCalledWith(
      "/repo",
      "GW:CL1",
      ["keep.txt"],
      { includeUntracked: false },
    );
    expect(res).toEqual({ stashedCount: 1, skippedUntrackedCount: 1 });
  });

  it("stashes only currently untracked files from the Unversioned changelist", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned Files",
          files: ["new-a.ts", "new-b.ts"],
        },
      ],
    } as any);

    const git = makeGit([
      { path: "new-a.ts", x: "?", y: "?" },
      { path: "new-b.ts", x: "?", y: "?" },
    ]);
    const uc = new CreateStashForChangelist(git, store as any);

    const res = await uc.run({
      repoRootFsPath: "/repo",
      changelistId: SystemChangelist.Unversioned,
    });

    expect(git.getStatusPorcelainZ).toHaveBeenCalledTimes(1);
    expect(git.stashPushPaths).toHaveBeenCalledWith(
      "/repo",
      "GW:Unversioned%20Files",
      ["new-a.ts", "new-b.ts"],
      { includeUntracked: true },
    );
    expect(res).toEqual({ stashedCount: 2, skippedUntrackedCount: 0 });
  });

  it("filters out files in Unversioned that are no longer currently untracked", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned Files",
          files: ["already-staged.ts", "still-untracked.ts"],
        },
      ],
    } as any);

    const git = makeGit([
      { path: "already-staged.ts", x: "A", y: " " },
      { path: "still-untracked.ts", x: "?", y: "?" },
    ]);
    const uc = new CreateStashForChangelist(git, store as any);

    const res = await uc.run({
      repoRootFsPath: "/repo",
      changelistId: SystemChangelist.Unversioned,
      message: "WIP",
    });

    expect(git.stashPushPaths).toHaveBeenCalledTimes(1);
    expect(git.stashPushPaths).toHaveBeenCalledWith(
      "/repo",
      "GW:Unversioned%20Files WIP",
      ["still-untracked.ts"],
      { includeUntracked: true },
    );
    expect(res).toEqual({ stashedCount: 1, skippedUntrackedCount: 1 });
  });

  it("throws if Unversioned changelist contains no currently untracked files", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned Files",
          files: ["staged.ts", "tracked.ts"],
        },
      ],
    } as any);

    const git = makeGit([
      { path: "staged.ts", x: "A", y: " " },
      { path: "tracked.ts", x: "M", y: " " },
    ]);
    const uc = new CreateStashForChangelist(git, store as any);

    await expect(
      uc.run({
        repoRootFsPath: "/repo",
        changelistId: SystemChangelist.Unversioned,
      }),
    ).rejects.toThrow(
      "Nothing to stash (this changelist contains no untracked files).",
    );

    expect(git.stashPushPaths).not.toHaveBeenCalled();
  });

  it("normalizes paths when matching current untracked files in Unversioned", async () => {
    const store = makeStore({
      version: 1,
      lists: [
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned Files",
          files: ["dir\\new-file.ts", "keep\\staged.ts"],
        },
      ],
    } as any);

    const git = makeGit([
      { path: "dir/new-file.ts", x: "?", y: "?" },
      { path: "keep/staged.ts", x: "A", y: " " },
    ]);
    const uc = new CreateStashForChangelist(git, store as any);

    const res = await uc.run({
      repoRootFsPath: "/repo",
      changelistId: SystemChangelist.Unversioned,
    });

    expect(git.stashPushPaths).toHaveBeenCalledWith(
      "/repo",
      "GW:Unversioned%20Files",
      ["dir/new-file.ts"],
      { includeUntracked: true },
    );
    expect(res).toEqual({ stashedCount: 1, skippedUntrackedCount: 1 });
  });
});
