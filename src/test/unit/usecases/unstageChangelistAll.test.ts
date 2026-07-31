import { describe, it, expect, vi, beforeEach } from "vitest";
import { unstageChangelistAll } from "../../../usecases/unstageChangelistAll";
import type { UnstagePaths } from "../../../usecases/unstagePaths";

function makeUnstagePaths(): UnstagePaths {
  return { run: vi.fn(async () => {}) } as unknown as UnstagePaths;
}

describe("unstageChangelistAll (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to unstagePaths.run(repoRootFsPath, repoRelativePaths)", async () => {
    const unstagePaths = makeUnstagePaths();

    const repoRoot = "/repo";
    const paths = ["a.txt", "b/c.ts"];

    await unstageChangelistAll(unstagePaths, repoRoot, paths);

    expect(unstagePaths.run).toHaveBeenCalledTimes(1);
    expect(unstagePaths.run).toHaveBeenCalledWith(repoRoot, paths);
  });

  it("passes through empty paths array (no filtering here)", async () => {
    const unstagePaths = makeUnstagePaths();

    await unstageChangelistAll(unstagePaths, "/repo", []);

    expect(unstagePaths.run).toHaveBeenCalledTimes(1);
    expect(unstagePaths.run).toHaveBeenCalledWith("/repo", []);
  });

  it("propagates errors from unstagePaths.run", async () => {
    const unstagePaths = makeUnstagePaths();
    (unstagePaths.run as any).mockRejectedValueOnce(new Error("boom"));

    await expect(
      unstageChangelistAll(unstagePaths, "/repo", ["a.txt"]),
    ).rejects.toThrow("boom");
  });
});
