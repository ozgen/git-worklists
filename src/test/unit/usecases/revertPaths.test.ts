import { describe, it, expect, vi } from "vitest";
import { RevertPaths } from "../../../usecases/revertPaths";
import { RenameMapping } from "../../../core/rename/renameMapping";
import type { GitClient } from "../../../adapters/git/gitClient";

function makeGit(): GitClient {
  return {
    discardFiles: vi.fn(async () => {}),
    revertRename: vi.fn(async () => {}),
  } as unknown as GitClient;
}

describe("RevertPaths", () => {
  it("reverts a plain path via discardFiles only", async () => {
    const git = makeGit();
    const uc = new RevertPaths(git, new RenameMapping());

    await uc.run("/repo", ["a.ts"]);

    expect(git.discardFiles).toHaveBeenCalledWith("/repo", ["a.ts"]);
    expect(git.revertRename).not.toHaveBeenCalled();
  });

  it("reverts a known rename target via revertRename, not discardFiles", async () => {
    const git = makeGit();
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");
    const uc = new RevertPaths(git, mapping);

    await uc.run("/repo", ["new.ts"]);

    expect(git.revertRename).toHaveBeenCalledWith("/repo", "old.ts", "new.ts");
    expect(git.discardFiles).toHaveBeenCalledWith("/repo", []);
  });

  it("splits a mixed batch between revertRename and one discardFiles call", async () => {
    const git = makeGit();
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");
    const uc = new RevertPaths(git, mapping);

    await uc.run("/repo", ["plain-a.ts", "new.ts", "plain-b.ts"]);

    expect(git.revertRename).toHaveBeenCalledTimes(1);
    expect(git.revertRename).toHaveBeenCalledWith("/repo", "old.ts", "new.ts");
    expect(git.discardFiles).toHaveBeenCalledWith("/repo", ["plain-a.ts", "plain-b.ts"]);
  });
});
