import { describe, it, expect, vi, beforeEach } from "vitest";
import { unstageChangelistAll } from "../../../usecases/unstageChangelistAll";
import type { GitClient } from "../../../adapters/git/gitClient";

function makeGit(): GitClient {
  return {
    getRepoRoot: vi.fn(),
    tryGetRepoRoot: vi.fn(),
    getStatusPorcelainZ: vi.fn(),
    add: vi.fn(),
    getGitDir: vi.fn(),
    isIgnored: vi.fn(),
    showFileAtRef: vi.fn(),

    stashList: vi.fn(),
    stashPushPaths: vi.fn(),
    stashApply: vi.fn(),
    stashPop: vi.fn(),
    stashDrop: vi.fn(),

    stageMany: vi.fn(async () => {}),
    unstageMany: vi.fn(async () => {}),
  } as unknown as GitClient;
}

describe("unstageChangelistAll (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to git.unstageMany(repoRootFsPath, repoRelativePaths)", async () => {
    const git = makeGit();

    const repoRoot = "/repo";
    const paths = ["a.txt", "b/c.ts"];

    await unstageChangelistAll(git, repoRoot, paths);

    expect(git.unstageMany).toHaveBeenCalledTimes(1);
    expect(git.unstageMany).toHaveBeenCalledWith(repoRoot, paths);
  });

  it("passes through empty paths array (no filtering here)", async () => {
    const git = makeGit();

    await unstageChangelistAll(git, "/repo", []);

    expect(git.unstageMany).toHaveBeenCalledTimes(1);
    expect(git.unstageMany).toHaveBeenCalledWith("/repo", []);
  });

  it("propagates errors from git.unstageMany", async () => {
    const git = makeGit();
    (git.unstageMany as any).mockRejectedValueOnce(new Error("boom"));

    await expect(unstageChangelistAll(git, "/repo", ["a.txt"])).rejects.toThrow(
      "boom",
    );
  });
});
