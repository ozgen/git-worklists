import { beforeEach, describe, expect, it, vi } from "vitest";

import * as process from "../../../utils/process";
import {
  getStagedPaths,
  stagePaths,
  unstagePaths,
} from "../../../git/staged";

describe("git/staged", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getStagedPaths returns empty set for empty output", async () => {
    vi.spyOn(process, "runGitCapture").mockResolvedValue("");

    const res = await getStagedPaths("/repo");
    expect(res.size).toBe(0);
  });

  it("getStagedPaths parses staged entries from porcelain v1 -z", async () => {
    vi.spyOn(process, "runGitCapture").mockResolvedValue(
      "M  file1\0A  file2\0 M file3\0?? file4\0",
    );

    const res = await getStagedPaths("/repo");
    expect([...res]).toEqual(["file1", "file2"]);
  });

  it("getStagedPaths normalizes backslashes to forward slashes", async () => {
    vi.spyOn(process, "runGitCapture").mockResolvedValue("M  a\\b\\c.txt\0");

    const res = await getStagedPaths("/repo");
    expect([...res]).toEqual(["a/b/c.txt"]);
  });

  it("stagePaths does nothing for empty list", async () => {
    const runGitSpy = vi.spyOn(process, "runGit").mockResolvedValue(undefined);

    await stagePaths("/repo", []);
    expect(runGitSpy).not.toHaveBeenCalled();
  });

  it("stagePaths calls git add with normalized paths", async () => {
    const runGitSpy = vi.spyOn(process, "runGit").mockResolvedValue(undefined);

    await stagePaths("/repo", ["a\\b.txt", "c/d.txt"]);
    expect(runGitSpy).toHaveBeenCalledWith("/repo", [
      "add",
      "--",
      "a/b.txt",
      "c/d.txt",
    ]);
  });

  it("unstagePaths does nothing for empty list", async () => {
    const runGitSpy = vi.spyOn(process, "runGit").mockResolvedValue(undefined);
    const runGitCaptureSpy = vi
      .spyOn(process, "runGitCapture")
      .mockResolvedValue("");

    await unstagePaths("/repo", []);
    expect(runGitSpy).not.toHaveBeenCalled();
    expect(runGitCaptureSpy).not.toHaveBeenCalled();
  });

  it("unstagePaths does nothing when none of the paths are staged", async () => {
    const runGitSpy = vi.spyOn(process, "runGit").mockResolvedValue(undefined);

    vi.spyOn(process, "runGitCapture").mockResolvedValue(
      " M file1\0?? file2\0",
    );

    await unstagePaths("/repo", ["file1", "file2"]);
    expect(runGitSpy).not.toHaveBeenCalled();
  });

  it("unstagePaths only unstages paths that are staged", async () => {
    const runGitSpy = vi.spyOn(process, "runGit").mockResolvedValue(undefined);

    vi.spyOn(process, "runGitCapture").mockResolvedValue(
      "M  file1\0 M file2\0A  file3\0",
    );

    await unstagePaths("/repo", ["file1", "file2", "file3"]);

    expect(runGitSpy).toHaveBeenCalledWith("/repo", [
      "restore",
      "--staged",
      "--",
      "file1",
      "file3",
    ]);
  });

  it("unstagePaths normalizes paths before checking staged", async () => {
    const runGitSpy = vi.spyOn(process, "runGit").mockResolvedValue(undefined);

    vi.spyOn(process, "runGitCapture").mockResolvedValue("M  a/b.txt\0");

    await unstagePaths("/repo", ["a\\b.txt"]);

    expect(runGitSpy).toHaveBeenCalledWith("/repo", [
      "restore",
      "--staged",
      "--",
      "a/b.txt",
    ]);
  });
});
