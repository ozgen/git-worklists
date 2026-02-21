import { describe, expect, it, vi } from "vitest";
import { RestageAlreadyStaged } from "../../../usecases/restageAlreadyStaged";

describe("RestageAlreadyStaged", () => {
  it("does nothing when stagedPaths is empty", async () => {
    const git = {
      add: vi.fn().mockResolvedValue(undefined),
    } as any;

    const uc = new RestageAlreadyStaged(git);

    await uc.run("/repo", new Set());

    expect(git.add).not.toHaveBeenCalled();
  });

  it("stages each path in stagedPaths", async () => {
    const git = {
      add: vi.fn().mockResolvedValue(undefined),
    } as any;

    const uc = new RestageAlreadyStaged(git);

    const repoRoot = "/repo";
    const stagedPaths = new Set<string>(["a.txt", "dir/b.txt"]);

    await uc.run(repoRoot, stagedPaths);

    expect(git.add).toHaveBeenCalledTimes(2);

    expect(git.add).toHaveBeenNthCalledWith(1, repoRoot, "a.txt");
    expect(git.add).toHaveBeenNthCalledWith(2, repoRoot, "dir/b.txt");
  });

  it("awaits staging sequentially (each add waits before the next)", async () => {
    const calls: string[] = [];

    const git = {
      add: vi.fn(async (_repoRoot: string, p: string) => {
        calls.push(`start:${p}`);
        await Promise.resolve();
        calls.push(`end:${p}`);
      }),
    } as any;

    const uc = new RestageAlreadyStaged(git);

    const stagedPaths = new Set<string>(["1.txt", "2.txt"]);
    await uc.run("/repo", stagedPaths);

    expect(calls).toEqual([
      "start:1.txt",
      "end:1.txt",
      "start:2.txt",
      "end:2.txt",
    ]);
  });
});