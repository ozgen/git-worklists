import { describe, expect, it, vi } from "vitest";
import { RestageAlreadyStaged } from "../../../usecases/restageAlreadyStaged";

describe("RestageAlreadyStaged", () => {
  it("does nothing when stagedPaths is empty", async () => {
    const git = {
      add: vi.fn().mockResolvedValue(undefined),
      getStatusPorcelainZ: vi.fn().mockResolvedValue([]),
    } as any;

    const uc = new RestageAlreadyStaged(git);

    await uc.run("/repo", new Set());

    expect(git.getStatusPorcelainZ).not.toHaveBeenCalled();
    expect(git.add).not.toHaveBeenCalled();
  });

  it("restages only paths in AM state", async () => {
    const git = {
      add: vi.fn().mockResolvedValue(undefined),
      getStatusPorcelainZ: vi.fn().mockResolvedValue([
        { path: "a.txt", x: "A", y: "M" },
        { path: "dir/b.txt", x: "M", y: "M" },
        { path: "c.txt", x: "A", y: " " },
        { path: "d.txt", x: "M", y: " " },
      ]),
    } as any;

    const uc = new RestageAlreadyStaged(git);

    const repoRoot = "/repo";
    const stagedPaths = new Set<string>([
      "a.txt",
      "dir/b.txt",
      "c.txt",
      "d.txt",
    ]);

    await uc.run(repoRoot, stagedPaths);

    expect(git.getStatusPorcelainZ).toHaveBeenCalledTimes(1);
    expect(git.getStatusPorcelainZ).toHaveBeenCalledWith(repoRoot);

    expect(git.add).toHaveBeenCalledTimes(1);
    expect(git.add).toHaveBeenCalledWith(repoRoot, "a.txt");
  });

  it("skips staged paths that are missing from porcelain output", async () => {
    const git = {
      add: vi.fn().mockResolvedValue(undefined),
      getStatusPorcelainZ: vi
        .fn()
        .mockResolvedValue([{ path: "a.txt", x: "A", y: "M" }]),
    } as any;

    const uc = new RestageAlreadyStaged(git);

    await uc.run("/repo", new Set(["a.txt", "missing.txt"]));

    expect(git.add).toHaveBeenCalledTimes(1);
    expect(git.add).toHaveBeenCalledWith("/repo", "a.txt");
  });

  it("does not restage MM files so partial staging is preserved", async () => {
    const git = {
      add: vi.fn().mockResolvedValue(undefined),
      getStatusPorcelainZ: vi
        .fn()
        .mockResolvedValue([{ path: "tracked.txt", x: "M", y: "M" }]),
    } as any;

    const uc = new RestageAlreadyStaged(git);

    await uc.run("/repo", new Set(["tracked.txt"]));

    expect(git.add).not.toHaveBeenCalled();
  });

  it("awaits restaging sequentially for matching AM paths", async () => {
    const calls: string[] = [];

    const git = {
      getStatusPorcelainZ: vi.fn().mockResolvedValue([
        { path: "1.txt", x: "A", y: "M" },
        { path: "2.txt", x: "A", y: "M" },
        { path: "3.txt", x: "M", y: "M" },
      ]),
      add: vi.fn(async (_repoRoot: string, p: string) => {
        calls.push(`start:${p}`);
        await Promise.resolve();
        calls.push(`end:${p}`);
      }),
    } as any;

    const uc = new RestageAlreadyStaged(git);

    await uc.run("/repo", new Set(["1.txt", "2.txt", "3.txt"]));

    expect(calls).toEqual([
      "start:1.txt",
      "end:1.txt",
      "start:2.txt",
      "end:2.txt",
    ]);
  });
});
