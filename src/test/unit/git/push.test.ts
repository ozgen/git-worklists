import { beforeEach, describe, expect, it, vi } from "vitest";

import * as process from "../../../utils/process";
import { pushWithUpstreamFallback } from "../../../git/push";

describe("git/push", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("pushWithUpstreamFallback uses plain push when it succeeds (amend=false)", async () => {
    const runGitSpy = vi.spyOn(process, "runGit").mockResolvedValue(undefined);

    await pushWithUpstreamFallback("/repo", { amend: false });

    expect(runGitSpy).toHaveBeenCalledWith("/repo", ["push"]);
  });

  it("pushWithUpstreamFallback uses force-with-lease when amend=true", async () => {
    const runGitSpy = vi.spyOn(process, "runGit").mockResolvedValue(undefined);

    await pushWithUpstreamFallback("/repo", { amend: true });

    expect(runGitSpy).toHaveBeenCalledWith("/repo", ["push", "--force-with-lease"]);
  });

  it("falls back to push -u origin <branch> when upstream missing (amend=false)", async () => {
    const runGitSpy = vi
      .spyOn(process, "runGit")
      .mockRejectedValueOnce(new Error("fatal: The current branch foo has no upstream branch."))
      .mockResolvedValueOnce(undefined);

    vi.spyOn(process, "runGitCapture").mockResolvedValue("feature/test-branch\n");

    await pushWithUpstreamFallback("/repo", { amend: false });

    expect(runGitSpy).toHaveBeenNthCalledWith(1, "/repo", ["push"]);
    expect(runGitSpy).toHaveBeenNthCalledWith(2, "/repo", [
      "push",
      "-u",
      "origin",
      "feature/test-branch",
    ]);
  });

  it("falls back to push -u origin <branch> --force-with-lease when upstream missing and amend=true", async () => {
    const runGitSpy = vi
      .spyOn(process, "runGit")
      .mockRejectedValueOnce(new Error("no upstream branch"))
      .mockResolvedValueOnce(undefined);

    vi.spyOn(process, "runGitCapture").mockResolvedValue("main\n");

    await pushWithUpstreamFallback("/repo", { amend: true });

    expect(runGitSpy).toHaveBeenNthCalledWith(1, "/repo", ["push", "--force-with-lease"]);
    expect(runGitSpy).toHaveBeenNthCalledWith(2, "/repo", [
      "push",
      "-u",
      "origin",
      "main",
      "--force-with-lease",
    ]);
  });

  it("rethrows errors that are not upstream-related", async () => {
    vi.spyOn(process, "runGit").mockRejectedValueOnce(new Error("fatal: some other push error"));

    await expect(pushWithUpstreamFallback("/repo", { amend: false })).rejects.toThrow(
      "fatal: some other push error",
    );
  });

  it("throws on detached HEAD during fallback branch resolution", async () => {
    vi.spyOn(process, "runGit").mockRejectedValueOnce(new Error("has no upstream branch"));
    vi.spyOn(process, "runGitCapture").mockResolvedValue("HEAD\n");

    await expect(pushWithUpstreamFallback("/repo", { amend: false })).rejects.toThrow(
      "Detached HEAD: cannot push without a branch.",
    );
  });
});
