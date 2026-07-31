import { describe, it, expect, vi } from "vitest";
import { UnstagePaths } from "../../../usecases/unstagePaths";
import { RenameMapping } from "../../../core/rename/renameMapping";
import type { GitClient } from "../../../adapters/git/gitClient";

function makeGit(): GitClient {
  return {
    unstageMany: vi.fn(async () => {}),
  } as unknown as GitClient;
}

describe("UnstagePaths", () => {
  it("unstages a plain path by itself", async () => {
    const git = makeGit();
    const uc = new UnstagePaths(git, new RenameMapping());

    await uc.run("/repo", ["a.ts"]);

    expect(git.unstageMany).toHaveBeenCalledWith("/repo", ["a.ts"]);
  });

  it("unstages both sides of a known rename in one call", async () => {
    const git = makeGit();
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");
    const uc = new UnstagePaths(git, mapping);

    await uc.run("/repo", ["new.ts"]);

    expect(git.unstageMany).toHaveBeenCalledTimes(1);
    const [, paths] = (git.unstageMany as any).mock.calls[0];
    expect(new Set(paths)).toEqual(new Set(["new.ts", "old.ts"]));
  });

  it("does not duplicate a path already in the requested set", async () => {
    const git = makeGit();
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");
    const uc = new UnstagePaths(git, mapping);

    await uc.run("/repo", ["new.ts", "old.ts"]);

    const [, paths] = (git.unstageMany as any).mock.calls[0];
    expect(paths).toHaveLength(2);
  });
});
