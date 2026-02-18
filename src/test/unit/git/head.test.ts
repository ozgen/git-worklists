import { beforeEach, describe, expect, it, vi } from "vitest";

import * as process from "../../../utils/process";
import { getHeadMessage, isHeadEmptyVsParent } from "../../../git/head";

describe("git/head", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getHeadMessage returns trimmed message", async () => {
    vi.spyOn(process, "runGitCapture").mockResolvedValue("hello\n\n");

    const msg = await getHeadMessage("/repo");
    expect(msg).toBe("hello");
  });

  it("isHeadEmptyVsParent returns false if HEAD has no parent (first commit)", async () => {
    const runGitSpy = vi
      .spyOn(process, "runGit")
      .mockRejectedValueOnce(new Error("fatal: Needed a single revision"));

    const res = await isHeadEmptyVsParent("/repo");
    expect(res).toBe(false);

    expect(runGitSpy).toHaveBeenCalledWith("/repo", ["rev-parse", "--verify", "HEAD^"]);
  });

  it("isHeadEmptyVsParent returns true when diff is quiet (no changes)", async () => {
    const runGitSpy = vi
      .spyOn(process, "runGit")
      .mockResolvedValueOnce(undefined) 
      .mockResolvedValueOnce(undefined); 

    const res = await isHeadEmptyVsParent("/repo");
    expect(res).toBe(true);

    expect(runGitSpy).toHaveBeenNthCalledWith(1, "/repo", ["rev-parse", "--verify", "HEAD^"]);
    expect(runGitSpy).toHaveBeenNthCalledWith(2, "/repo", ["diff", "--quiet", "HEAD^", "HEAD"]);
  });

  it("isHeadEmptyVsParent returns false when diff exits with code 1 (changes exist)", async () => {
    vi.spyOn(process, "runGit")
      .mockResolvedValueOnce(undefined) 
      .mockRejectedValueOnce(new Error("Command failed (code 1)")); 

    const res = await isHeadEmptyVsParent("/repo");
    expect(res).toBe(false);
  });

  it("isHeadEmptyVsParent returns false for unexpected diff errors too", async () => {
    vi.spyOn(process, "runGit")
      .mockResolvedValueOnce(undefined) 
      .mockRejectedValueOnce(new Error("weird error (code 128)"));

    const res = await isHeadEmptyVsParent("/repo");
    expect(res).toBe(false);
  });
});
