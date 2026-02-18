import { describe, it, expect, vi } from "vitest";

import { ListStashes } from "../../../../usecases/stash/listStashes";
import type {
  GitClient,
  GitStashEntry,
} from "../../../../adapters/git/gitClient";

function makeGit(returnValue: GitStashEntry[] = []): GitClient {
  return {
    getRepoRoot: vi.fn(async () => "/repo"),
    getStatusPorcelainZ: vi.fn(async () => [] as any),
    add: vi.fn(async () => {}),
    getGitDir: vi.fn(async () => "/repo/.git"),

    stashList: vi.fn(async (_repoRoot: string) => returnValue),
    stashPushPaths: vi.fn(async () => {}),
    stashApply: vi.fn(async () => {}),
    stashPop: vi.fn(async () => {}),
    stashDrop: vi.fn(async () => {}),
    tryGetRepoRoot: vi.fn(),
    isIgnored: vi.fn(),
    showFileAtRef: vi.fn(),
    stageMany: vi.fn(async () => {}),
    unstageMany: vi.fn(async () => {}),
  };
}

describe("ListStashes", () => {
  it("returns result from git.stashList", async () => {
    const stashes: GitStashEntry[] = [
      {
        ref: "stash@{0}",
        message: "On main: test",
        raw: "stash@{0}: On main: test",
      },
      {
        ref: "stash@{1}",
        message: "On dev: GW:abc WIP",
        raw: "stash@{1}: On dev: GW:abc WIP",
        isGitWorklists: true,
        changelistId: "abc",
      },
    ];

    const git = makeGit(stashes);
    const uc = new ListStashes(git);

    const res = await uc.run("/repo");

    expect(git.stashList).toHaveBeenCalledTimes(1);
    expect(git.stashList).toHaveBeenCalledWith("/repo");
    expect(res).toEqual(stashes);
  });

  it("propagates errors from git.stashList", async () => {
    const git = makeGit([]);
    (git.stashList as any).mockRejectedValueOnce(new Error("boom"));

    const uc = new ListStashes(git);

    await expect(uc.run("/repo")).rejects.toThrow("boom");
  });
});
