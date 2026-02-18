import { describe, it, expect, vi, beforeEach } from "vitest";
import { stageChangelistAll } from "../../../usecases/stageChangelistAll";
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
  } as unknown as GitClient;
}

describe("stageChangelistAll (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to git.stageMany(repoRootFsPath, repoRelativePaths)", async () => {
    const git = makeGit();

    const repoRoot = "/repo";
    const paths = ["a.txt", "b/c.ts"];

    await stageChangelistAll(git, repoRoot, paths);

    expect(git.stageMany).toHaveBeenCalledTimes(1);
    expect(git.stageMany).toHaveBeenCalledWith(repoRoot, paths);
  });

  it("passes through empty paths array (no filtering here)", async () => {
    const git = makeGit();

    await stageChangelistAll(git, "/repo", []);

    expect(git.stageMany).toHaveBeenCalledTimes(1);
    expect(git.stageMany).toHaveBeenCalledWith("/repo", []);
  });

  it("propagates errors from git.stageMany", async () => {
    const git = makeGit();
    (git.stageMany as any).mockRejectedValueOnce(new Error("boom"));

    await expect(stageChangelistAll(git, "/repo", ["a.txt"])).rejects.toThrow(
      "boom",
    );
  });
});
