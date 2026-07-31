import { describe, it, expect, vi } from "vitest";
import { StagePaths } from "../../../usecases/stagePaths";
import { RenameMapping } from "../../../core/rename/renameMapping";
import type { GitClient } from "../../../adapters/git/gitClient";

function makeGit(): GitClient {
  return {
    stageMany: vi.fn(async () => {}),
    stageRename: vi.fn(async () => {}),
  } as unknown as GitClient;
}

describe("StagePaths", () => {
  it("stages a plain path via stageMany only", async () => {
    const git = makeGit();
    const uc = new StagePaths(git, new RenameMapping());

    await uc.run("/repo", ["a.ts"]);

    expect(git.stageMany).toHaveBeenCalledWith("/repo", ["a.ts"]);
    expect(git.stageRename).not.toHaveBeenCalled();
  });

  it("stages a known rename target via stageRename, not stageMany", async () => {
    const git = makeGit();
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");
    const uc = new StagePaths(git, mapping);

    await uc.run("/repo", ["new.ts"]);

    expect(git.stageRename).toHaveBeenCalledWith("/repo", "old.ts", "new.ts");
    expect(git.stageMany).toHaveBeenCalledWith("/repo", []);
  });

  it("splits a mixed batch between stageRename and one stageMany call", async () => {
    const git = makeGit();
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");
    const uc = new StagePaths(git, mapping);

    await uc.run("/repo", ["plain-a.ts", "new.ts", "plain-b.ts"]);

    expect(git.stageRename).toHaveBeenCalledTimes(1);
    expect(git.stageRename).toHaveBeenCalledWith("/repo", "old.ts", "new.ts");
    expect(git.stageMany).toHaveBeenCalledWith("/repo", ["plain-a.ts", "plain-b.ts"]);
  });
});
