import { describe, it, expect, vi, beforeEach } from "vitest";
import { stageChangelistAll } from "../../../usecases/stageChangelistAll";
import type { StagePaths } from "../../../usecases/stagePaths";

function makeStagePaths(): StagePaths {
  return { run: vi.fn(async () => {}) } as unknown as StagePaths;
}

describe("stageChangelistAll (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to stagePaths.run(repoRootFsPath, repoRelativePaths)", async () => {
    const stagePaths = makeStagePaths();

    const repoRoot = "/repo";
    const paths = ["a.txt", "b/c.ts"];

    await stageChangelistAll(stagePaths, repoRoot, paths);

    expect(stagePaths.run).toHaveBeenCalledTimes(1);
    expect(stagePaths.run).toHaveBeenCalledWith(repoRoot, paths);
  });

  it("passes through empty paths array (no filtering here)", async () => {
    const stagePaths = makeStagePaths();

    await stageChangelistAll(stagePaths, "/repo", []);

    expect(stagePaths.run).toHaveBeenCalledTimes(1);
    expect(stagePaths.run).toHaveBeenCalledWith("/repo", []);
  });

  it("propagates errors from stagePaths.run", async () => {
    const stagePaths = makeStagePaths();
    (stagePaths.run as any).mockRejectedValueOnce(new Error("boom"));

    await expect(
      stageChangelistAll(stagePaths, "/repo", ["a.txt"]),
    ).rejects.toThrow("boom");
  });
});
