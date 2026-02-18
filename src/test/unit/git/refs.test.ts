import { beforeEach, describe, expect, it, vi } from "vitest";

import * as process from "../../../utils/process";
import { fileExistsAtRef, isNewFileInRepo } from "../../../git/refs";

describe("git/refs", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("isNewFileInRepo returns false if file exists in HEAD", async () => {
    const runGitSpy = vi.spyOn(process, "runGit").mockResolvedValue(undefined);

    const res = await isNewFileInRepo("/repo", "a.txt");
    expect(res).toBe(false);

    expect(runGitSpy).toHaveBeenCalledWith("/repo", ["cat-file", "-e", "HEAD:a.txt"]);
  });

  it("isNewFileInRepo returns true if file does not exist in HEAD", async () => {
    vi.spyOn(process, "runGit").mockRejectedValue(new Error("not found"));

    const res = await isNewFileInRepo("/repo", "a.txt");
    expect(res).toBe(true);
  });

  it("fileExistsAtRef returns true when cat-file succeeds", async () => {
    const runGitSpy = vi.spyOn(process, "runGit").mockResolvedValue(undefined);

    const res = await fileExistsAtRef("/repo", "HEAD", "a.txt");
    expect(res).toBe(true);

    expect(runGitSpy).toHaveBeenCalledWith("/repo", ["cat-file", "-e", "HEAD:a.txt"]);
  });

  it("fileExistsAtRef returns false when cat-file fails", async () => {
    vi.spyOn(process, "runGit").mockRejectedValue(new Error("not found"));

    const res = await fileExistsAtRef("/repo", "HEAD", "a.txt");
    expect(res).toBe(false);
  });
});
