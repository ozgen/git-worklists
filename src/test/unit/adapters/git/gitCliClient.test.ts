import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "path";

const mocks = vi.hoisted(() => {
  return {
    execFile: vi.fn(),
  };
});

vi.mock("child_process", () => {
  return {
    execFile: mocks.execFile,
  };
});

import {
  GitCliClient,
  parseStashLine,
} from "../../../../adapters/git/gitCliClient";

type ExecCall = { args: string[]; cwd: string };

function mockExecFileWithRouter(
  router: (
    args: string[],
    cwd: string,
  ) => { stdout: string; stderr?: string } | Error,
) {
  const calls: ExecCall[] = [];

  mocks.execFile.mockImplementation(
    (_file: string, args: string[], opts: any, cb: any) => {
      const cwd = opts?.cwd as string;
      calls.push({ args, cwd });

      const res = router(args, cwd);
      if (res instanceof Error) {
        cb(res, "", res.message);
        return;
      }
      cb(null, res.stdout, res.stderr ?? "");
    },
  );

  return { calls };
}

function mockExecFileFailureOnce(stderr: string) {
  mocks.execFile.mockImplementationOnce(
    (_file: string, args: string[], opts: any, cb: any) => {
      cb(new Error("git failed"), "", stderr);
    },
  );
}

beforeEach(() => {
  mocks.execFile.mockReset();
});

describe("parseStashLine", () => {
  it("returns null for empty lines", () => {
    expect(parseStashLine("")).toBeNull();
    expect(parseStashLine("   ")).toBeNull();
  });

  it("parses standard stash line and GW tag", () => {
    const e = parseStashLine("stash@{0}: On main: GW:abc123 WIP message");
    expect(e).toMatchObject({
      ref: "stash@{0}",
      message: "On main: GW:abc123 WIP message",
      isGitWorklists: true,
      changelistId: "abc123",
    });
  });

  it("handles unknown format by keeping raw", () => {
    const e = parseStashLine("weird format line");
    expect(e).toMatchObject({
      ref: "stash@{?}",
      message: "weird format line",
      raw: "weird format line",
    });
  });

  it("sets isGitWorklists=false when no GW tag exists", () => {
    const e = parseStashLine("stash@{3}: On main: plain message");
    expect(e).toMatchObject({
      ref: "stash@{3}",
      message: "On main: plain message",
      isGitWorklists: false,
      changelistId: undefined,
    });
  });

  it("detects GW tag even if it is not at the beginning of message", () => {
    const e = parseStashLine("stash@{0}: On main: something GW:xyz_99 later");
    expect(e).toMatchObject({
      ref: "stash@{0}",
      isGitWorklists: true,
      changelistId: "xyz_99",
    });
  });

  it("does not treat 'GW:' without an id as a valid tag", () => {
    const e = parseStashLine("stash@{0}: On main: GW: WIP");
    expect(e).toMatchObject({
      ref: "stash@{0}",
      isGitWorklists: false,
      changelistId: undefined,
    });
  });
});

describe("GitCliClient (mocked git)", () => {
  it("getRepoRoot trims output", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
        return { stdout: "/repo\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const root = await git.getRepoRoot("/work");

    expect(root).toBe("/repo");
    expect(calls[0]).toEqual({
      args: ["rev-parse", "--show-toplevel"],
      cwd: "/work",
    });
  });

  it("getStatusPorcelainZ parses entries including rename", async () => {
    const porcelain =
      " M file1.txt\0" +
      "A  staged.ts\0" +
      "R  old.txt\0new.txt\0" +
      "?? untracked.md\0";

    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "status --porcelain=v1 -z") {
        return { stdout: porcelain };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const entries = await git.getStatusPorcelainZ("/repo");

    expect(entries).toEqual([
      { path: "file1.txt", x: " ", y: "M" },
      { path: "staged.ts", x: "A", y: " " },
      { path: "new.txt", x: "R", y: " " },
      { path: "untracked.md", x: "?", y: "?" },
    ]);
  });

  it("add runs git add -- path", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "add") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.add("/repo", "a b.txt");

    expect(calls[0]).toEqual({
      args: ["add", "--", "a b.txt"],
      cwd: "/repo",
    });
  });

  it("getGitDir joins relative .git dir to repoRoot", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "rev-parse --git-dir") {
        return { stdout: ".git\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const gitDir = await git.getGitDir("/repo");

    expect(gitDir).toBe(path.join("/repo", ".git"));
  });

  it("getGitDir returns absolute path unchanged", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "rev-parse --git-dir") {
        return { stdout: "/abs/gitdir\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const gitDir = await git.getGitDir("/repo");

    expect(gitDir).toBe("/abs/gitdir");
  });

  it("stashList parses lines", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "stash list") {
        return {
          stdout:
            "stash@{0}: On main: GW:list1 WIP\n" +
            "stash@{1}: On dev: something else\n",
        };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const stashes = await git.stashList("/repo");

    expect(stashes.length).toBe(2);
    expect(stashes[0]).toMatchObject({
      ref: "stash@{0}",
      isGitWorklists: true,
      changelistId: "list1",
    });
    expect(stashes[1]).toMatchObject({
      ref: "stash@{1}",
      isGitWorklists: false,
    });
  });

  it("stashPushPaths throws if no paths", async () => {
    const git = new GitCliClient();
    await expect(git.stashPushPaths("/repo", "msg", [])).rejects.toThrow(
      "No files provided to stash.",
    );
  });

  it("stashPushPaths runs git stash push -m msg -- paths", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "stash" && args[1] === "push") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.stashPushPaths("/repo", "GW:abc hi", ["a.txt", "b/c.ts"]);

    expect(calls[0]).toEqual({
      args: ["stash", "push", "-m", "GW:abc hi", "--", "a.txt", "b/c.ts"],
      cwd: "/repo",
    });
  });

  it("tryGetRepoRoot returns null when git rev-parse fails", async () => {
    mockExecFileWithRouter((args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
        return new Error("not a git repo");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const root = await git.tryGetRepoRoot("/work");

    expect(root).toBeNull();
  });

  it("isIgnored returns true when check-ignore succeeds", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "check-ignore") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const ignored = await git.isIgnored("/repo", "ignored.txt");

    expect(ignored).toBe(true);
    expect(calls[0]).toEqual({
      args: ["check-ignore", "-q", "--", "ignored.txt"],
      cwd: "/repo",
    });
  });

  it("isIgnored returns false when check-ignore fails", async () => {
    mockExecFileWithRouter((args) => {
      if (args[0] === "check-ignore") {
        return new Error("exit 1 => not ignored");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const ignored = await git.isIgnored("/repo", "not-ignored.txt");

    expect(ignored).toBe(false);
  });

  it("stageMany is a no-op for empty list", async () => {
    const { calls } = mockExecFileWithRouter(() => {
      return new Error("should not be called");
    });

    const git = new GitCliClient();
    await git.stageMany("/repo", []);

    expect(calls.length).toBe(0);
  });

  it("stageMany runs git add -- <paths...>", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "add") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.stageMany("/repo", ["a.txt", "b/c.ts"]);

    expect(calls[0]).toEqual({
      args: ["add", "--", "a.txt", "b/c.ts"],
      cwd: "/repo",
    });
  });

  it("unstageMany is a no-op for empty list", async () => {
    const { calls } = mockExecFileWithRouter(() => {
      return new Error("should not be called");
    });

    const git = new GitCliClient();
    await git.unstageMany("/repo", []);

    expect(calls.length).toBe(0);
  });

  it("unstageMany runs git restore --staged -- <paths...>", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "restore" && args[1] === "--staged") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.unstageMany("/repo", ["a.txt", "b/c.ts"]);

    expect(calls[0]).toEqual({
      args: ["restore", "--staged", "--", "a.txt", "b/c.ts"],
      cwd: "/repo",
    });
  });

  it("stashApply runs git stash apply <ref>", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "stash" && args[1] === "apply") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.stashApply("/repo", "stash@{2}");

    expect(calls[0]).toEqual({
      args: ["stash", "apply", "stash@{2}"],
      cwd: "/repo",
    });
  });

  it("stashPop runs git stash pop <ref>", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "stash" && args[1] === "pop") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.stashPop("/repo", "stash@{1}");

    expect(calls[0]).toEqual({
      args: ["stash", "pop", "stash@{1}"],
      cwd: "/repo",
    });
  });

  it("stashDrop runs git stash drop <ref>", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "stash" && args[1] === "drop") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.stashDrop("/repo", "stash@{0}");

    expect(calls[0]).toEqual({
      args: ["stash", "drop", "stash@{0}"],
      cwd: "/repo",
    });
  });

  it("getStatusPorcelainZ ignores empty headers and trims paths", async () => {
    const porcelain = "\0 M  spaced.txt  \0\0";
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "status --porcelain=v1 -z") {
        return { stdout: porcelain };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const entries = await git.getStatusPorcelainZ("/repo");

    expect(entries).toEqual([{ path: "spaced.txt", x: " ", y: "M" }]);
  });

  it("getStatusPorcelainZ handles copy (C) like rename (takes second path)", async () => {
    const porcelain = "C  old.txt\0new.txt\0";
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "status --porcelain=v1 -z") {
        return { stdout: porcelain };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const entries = await git.getStatusPorcelainZ("/repo");

    expect(entries).toEqual([{ path: "new.txt", x: "C", y: " " }]);
  });

  it("showFileAtRef runs git show REF:path", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "show") {
        return { stdout: "file-content\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const out = await git.showFileAtRef("/repo", "HEAD", "src/a.ts");

    expect(out).toBe("file-content\n");
    expect(calls[0]).toEqual({
      args: ["show", "HEAD:src/a.ts"],
      cwd: "/repo",
    });
  });

  it("showFileAtRef propagates git errors", async () => {
    mockExecFileWithRouter((args) => {
      if (args[0] === "show") {
        return new Error("fatal: Path 'x' does not exist in 'HEAD'");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await expect(
      git.showFileAtRef("/repo", "HEAD", "missing.txt"),
    ).rejects.toThrow("git show HEAD:missing.txt failed");
  });

  it("getUpstreamRef returns trimmed upstream ref", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (
        args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}"
      ) {
        return { stdout: "origin/main\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const upstream = await git.getUpstreamRef("/repo");

    expect(upstream).toBe("origin/main");
    expect(calls[0]).toEqual({
      args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      cwd: "/repo",
    });
  });

  it("getUpstreamRef throws when upstream is missing", async () => {
    mockExecFileWithRouter((args) => {
      if (args[0] === "rev-parse" && args.includes("@{u}")) {
        return new Error("fatal: no upstream configured");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await expect(git.getUpstreamRef("/repo")).rejects.toThrow(
      "git rev-parse --abbrev-ref --symbolic-full-name @{u} failed",
    );
  });

  it("listOutgoingCommits returns [] when log output is empty", async () => {
    mockExecFileWithRouter((args) => {
      const cmd = args.join(" ");
      if (cmd === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
        return { stdout: "origin/main\n" };
      }
      if (cmd.includes(" log ") && cmd.includes("origin/main..HEAD")) {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const commits = await git.listOutgoingCommits("/repo");

    expect(commits).toEqual([]);
  });

  it("listOutgoingCommits parses commits from upstream..HEAD", async () => {
    const sep = "\x1f";
    const logOut =
      [
        [
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "aaaaaaa",
          "First commit",
          "Mehmet",
          "2026-02-19T10:11:12+01:00",
        ].join(sep),
        [
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "bbbbbbb",
          "Second commit",
          "Alice",
          "2026-02-19T12:00:00+01:00",
        ].join(sep),
      ].join("\n") + "\n";

    const { calls } = mockExecFileWithRouter((args) => {
      const cmd = args.join(" ");
      if (cmd === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
        return { stdout: "origin/main\n" };
      }
      if (cmd.includes(" log ") && cmd.includes("origin/main..HEAD")) {
        return { stdout: logOut };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const commits = await git.listOutgoingCommits("/repo");

    expect(commits).toEqual([
      {
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        shortHash: "aaaaaaa",
        subject: "First commit",
        authorName: "Mehmet",
        authorDateIso: "2026-02-19T10:11:12+01:00",
      },
      {
        hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        shortHash: "bbbbbbb",
        subject: "Second commit",
        authorName: "Alice",
        authorDateIso: "2026-02-19T12:00:00+01:00",
      },
    ]);

    expect(
      calls.some((c) => c.args.join(" ").includes("origin/main..HEAD")),
    ).toBe(true);
  });

  it("listOutgoingCommits uses HEAD --not --remotes when no upstream exists", async () => {
    const sep = "\x1f";
    const logOut =
      [
        [
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "aaaaaaa",
          "Local commit",
          "Mehmet",
          "2026-02-20T10:00:00+01:00",
        ].join(sep),
      ].join("\n") + "\n";

    const { calls } = mockExecFileWithRouter((args) => {
      const cmd = args.join(" ");

      if (cmd === "rev-parse --abbrev-ref --symbolic-full-name @{u}") {
        return new Error("fatal: no upstream configured");
      }

      if (cmd.includes(" log ") && cmd.includes(" HEAD --not --remotes")) {
        return { stdout: logOut };
      }

      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const commits = await git.listOutgoingCommits("/repo");

    expect(commits).toEqual([
      {
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        shortHash: "aaaaaaa",
        subject: "Local commit",
        authorName: "Mehmet",
        authorDateIso: "2026-02-20T10:00:00+01:00",
      },
    ]);

    expect(
      calls.some((c) =>
        c.args.join(" ").includes("rev-parse --abbrev-ref --symbolic-full-name @{u}"),
      ),
    ).toBe(true);

    expect(
      calls.some(
        (c) =>
          c.args.join(" ").includes("log") &&
          c.args.includes("HEAD") &&
          c.args.includes("--not") &&
          c.args.includes("--remotes"),
      ),
    ).toBe(true);
  });

  it("getCommitFiles returns [] when show --name-status output is empty", async () => {
    mockExecFileWithRouter((args) => {
      const cmd = args.join(" ");
      if (cmd.includes(" show --name-status --format= ")) {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.getCommitFiles("/repo", "deadbeef");

    expect(files).toEqual([]);
  });

  it("getCommitFiles parses M/A/D entries", async () => {
    const showOut = "M\tsrc/a.ts\n" + "A\tREADME.md\n" + "D\told.txt\n";

    const { calls } = mockExecFileWithRouter((args) => {
      const cmd = args.join(" ");
      if (
        cmd.includes(" show --name-status --format= ") &&
        cmd.endsWith(" deadbeef")
      ) {
        return { stdout: showOut };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.getCommitFiles("/repo", "deadbeef");

    expect(files).toEqual([
      { status: "M", path: "src/a.ts" },
      { status: "A", path: "README.md" },
      { status: "D", path: "old.txt" },
    ]);

    expect(calls[0].cwd).toBe("/repo");
    expect(calls[0].args.includes("show")).toBe(true);
    expect(calls[0].args.includes("--name-status")).toBe(true);
  });

  it("getCommitFiles parses rename (R) with oldPath", async () => {
    const showOut = "R100\told/name.txt\tnew/name.txt\n";

    mockExecFileWithRouter((args) => {
      const cmd = args.join(" ");
      if (
        cmd.includes(" show --name-status --format= ") &&
        cmd.endsWith(" cafebabe")
      ) {
        return { stdout: showOut };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.getCommitFiles("/repo", "cafebabe");

    expect(files).toEqual([
      { status: "R", oldPath: "old/name.txt", path: "new/name.txt" },
    ]);
  });

  it("getCommitFiles parses copy (C) with oldPath", async () => {
    const showOut = "C100\tfrom.txt\tto.txt\n";

    mockExecFileWithRouter((args) => {
      const cmd = args.join(" ");
      if (
        cmd.includes(" show --name-status --format= ") &&
        cmd.endsWith(" feedface")
      ) {
        return { stdout: showOut };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.getCommitFiles("/repo", "feedface");

    expect(files).toEqual([
      { status: "C", oldPath: "from.txt", path: "to.txt" },
    ]);
  });

  it("getCommitFiles ignores malformed lines", async () => {
    const showOut = "\n" + "M\n" + "A\tgood.txt\n" + "\tbroken\n";

    mockExecFileWithRouter((args) => {
      const cmd = args.join(" ");
      if (
        cmd.includes(" show --name-status --format= ") &&
        cmd.endsWith(" abcdef")
      ) {
        return { stdout: showOut };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.getCommitFiles("/repo", "abcdef");

    expect(files).toEqual([{ status: "A", path: "good.txt" }]);
  });

  it("showFileAtRefOptional returns content on success", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "show") {
        return { stdout: "file-content\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const out = await git.showFileAtRefOptional("/repo", "HEAD", "src/a.ts");

    expect(out).toBe("file-content\n");
    expect(calls[0]).toEqual({
      args: ["show", "HEAD:src/a.ts"],
      cwd: "/repo",
    });
  });

  it("showFileAtRefOptional returns undefined when file exists on disk, but not in ref", async () => {
    mockExecFileFailureOnce(
      "fatal: path 'vvvvvv.txt' exists on disk, but not in 'deadbeef^'\n",
    );

    const git = new GitCliClient();
    const out = await git.showFileAtRefOptional(
      "/repo",
      "deadbeef^",
      "vvvvvv.txt",
    );

    expect(out).toBeUndefined();
  });

  it("showFileAtRefOptional returns undefined when path does not exist in ref (generic)", async () => {
    mockExecFileFailureOnce(
      "fatal: Path 'missing.txt' does not exist in 'HEAD'\n",
    );

    const git = new GitCliClient();
    const out = await git.showFileAtRefOptional("/repo", "HEAD", "missing.txt");

    expect(out).toBeUndefined();
  });

  it("showFileAtRefOptional returns undefined when error contains \"does not exist in\"", async () => {
    mockExecFileFailureOnce("fatal: does not exist in 'HEAD'\n");

    const git = new GitCliClient();
    const out = await git.showFileAtRefOptional("/repo", "HEAD", "x");

    expect(out).toBeUndefined();
  });

  it("showFileAtRefOptional returns undefined when ref is invalid object name", async () => {
    mockExecFileFailureOnce("fatal: invalid object name 'EMPTY'\n");

    const git = new GitCliClient();
    const out = await git.showFileAtRefOptional("/repo", "EMPTY", "src/a.ts");

    expect(out).toBeUndefined();
  });

  it("showFileAtRefOptional returns undefined when ref is bad object", async () => {
    mockExecFileFailureOnce("fatal: bad object deadbeef^\n");

    const git = new GitCliClient();
    const out = await git.showFileAtRefOptional("/repo", "deadbeef^", "src/a.ts");

    expect(out).toBeUndefined();
  });

  it("showFileAtRefOptional returns undefined when ref is not a valid object name", async () => {
    mockExecFileFailureOnce("fatal: Not a valid object name HEAD^\n");

    const git = new GitCliClient();
    const out = await git.showFileAtRefOptional("/repo", "HEAD^", "src/a.ts");

    expect(out).toBeUndefined();
  });

  it("showFileAtRefOptional rethrows unknown git errors", async () => {
    mockExecFileFailureOnce("fatal: some other scary error\n");

    const git = new GitCliClient();
    await expect(
      git.showFileAtRefOptional("/repo", "HEAD", "src/a.ts"),
    ).rejects.toThrow("git show HEAD:src/a.ts failed");
  });

  it("tryGetUpstreamRef returns trimmed upstream ref", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (
        args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}"
      ) {
        return { stdout: "origin/main\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const upstream = await git.tryGetUpstreamRef("/repo");

    expect(upstream).toBe("origin/main");
    expect(calls[0]).toEqual({
      args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      cwd: "/repo",
    });
  });

  it("tryGetUpstreamRef returns undefined when upstream is missing", async () => {
    mockExecFileWithRouter((args) => {
      if (args[0] === "rev-parse" && args.includes("@{u}")) {
        return new Error("fatal: no upstream configured");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const upstream = await git.tryGetUpstreamRef("/repo");

    expect(upstream).toBeUndefined();
  });

  it("execGit rejects with timeout error when git hangs", async () => {
    vi.useFakeTimers();

    mocks.execFile.mockImplementation(
      (_file: string, _args: string[], _opts: any, _cb: any) => {
        // Never calls cb — simulates a hanging git process
        return {
          kill: vi.fn(),
          on: vi.fn(),
        };
      },
    );

    const git = new GitCliClient();
    const promise = git.getRepoRoot("/work");

    vi.advanceTimersByTime(10_001);

    await expect(promise).rejects.toThrow("timed out after 10000ms");

    vi.useRealTimers();
  });

  it("getStatusPorcelainZ keeps original path when rename second path is empty", async () => {
    const porcelain = "R  old.txt\0\0";

    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "status --porcelain=v1 -z") {
        return { stdout: porcelain };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const entries = await git.getStatusPorcelainZ("/repo");

    expect(entries).toEqual([{ path: "old.txt", x: "R", y: " " }]);
  });

  it("getUpstreamRef throws when upstream ref is empty string", async () => {
    mockExecFileWithRouter((args) => {
      if (
        args.join(" ") === "rev-parse --abbrev-ref --symbolic-full-name @{u}"
      ) {
        return { stdout: "\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await expect(git.getUpstreamRef("/repo")).rejects.toThrow(
      "No upstream configured for current branch.",
    );
  });

  it("getCommitFiles skips rename entry when new path is missing", async () => {
    const showOut = "R100\told/name.txt\n" + "A\tgood.txt\n";

    mockExecFileWithRouter((args) => {
      const cmd = args.join(" ");
      if (
        cmd.includes(" show --name-status --format= ") &&
        cmd.endsWith(" abc123")
      ) {
        return { stdout: showOut };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.getCommitFiles("/repo", "abc123");

    expect(files).toEqual([{ status: "A", path: "good.txt" }]);
  });

  it("stashListFiles runs git diff --name-status <stashRef>^1 <stashRef>", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (
        args[0] === "diff" &&
        args[1] === "--name-status" &&
        args[2] === "stash@{0}^1" &&
        args[3] === "stash@{0}"
      ) {
        return { stdout: "M\tsrc/a.ts\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.stashListFiles("/repo", "stash@{0}");

    expect(files).toEqual([{ status: "M", path: "src/a.ts" }]);

    expect(calls[0]).toEqual({
      args: ["diff", "--name-status", "stash@{0}^1", "stash@{0}"],
      cwd: "/repo",
    });
  });

  it("stashListFiles parses A/M/D entries", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "diff --name-status stash@{1}^1 stash@{1}") {
        return {
          stdout: "A\tnew.txt\nM\tsrc/a.ts\nD\told.txt\n",
        };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.stashListFiles("/repo", "stash@{1}");

    expect(files).toEqual([
      { status: "A", path: "new.txt" },
      { status: "M", path: "src/a.ts" },
      { status: "D", path: "old.txt" },
    ]);
  });

  it("stashListFiles parses rename (R) with oldPath", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "diff --name-status stash@{2}^1 stash@{2}") {
        return { stdout: "R100\told/name.txt\tnew/name.txt\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.stashListFiles("/repo", "stash@{2}");

    expect(files).toEqual([
      { status: "R", oldPath: "old/name.txt", path: "new/name.txt" },
    ]);
  });

  it("stashListFiles parses copy (C) with oldPath", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "diff --name-status stash@{3}^1 stash@{3}") {
        return { stdout: "C100\tfrom.txt\tto.txt\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.stashListFiles("/repo", "stash@{3}");

    expect(files).toEqual([
      { status: "C", oldPath: "from.txt", path: "to.txt" },
    ]);
  });

  it("stashListFiles ignores malformed lines", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "diff --name-status stash@{4}^1 stash@{4}") {
        return {
          stdout:
            "\n" +
            "M\n" +
            "A\tgood.txt\n" +
            "\tbroken\n" +
            "R100\toldOnly\n" +
            "C100\tfromOnly\n",
        };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.stashListFiles("/repo", "stash@{4}");

    expect(files).toEqual([{ status: "A", path: "good.txt" }]);
  });

  it("stashListFiles returns [] when diff output is empty", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "diff --name-status stash@{5}^1 stash@{5}") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const files = await git.stashListFiles("/repo", "stash@{5}");

    expect(files).toEqual([]);
  });

  it("stashListFiles propagates git errors", async () => {
    mockExecFileWithRouter((args) => {
      if (args[0] === "diff" && args[1] === "--name-status") {
        return new Error("fatal: bad revision");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await expect(git.stashListFiles("/repo", "stash@{0}")).rejects.toThrow(
      "git diff --name-status stash@{0}^1 stash@{0} failed",
    );
  });
});

// ─── getStagedFilesInGroup (pure helper from gitClient.ts) ───────────────────

import { getStagedFilesInGroup } from "../../../../adapters/git/gitClient";

describe("getStagedFilesInGroup", () => {
  it("returns empty array when files is empty", () => {
    const res = getStagedFilesInGroup([], new Set(["a.txt"]));
    expect(res).toEqual([]);
  });

  it("returns only files that are staged (intersection)", () => {
    const staged = new Set(["a.txt", "c.txt"]);
    const res = getStagedFilesInGroup(["a.txt", "b.txt", "c.txt"], staged);
    expect(res).toEqual(["a.txt", "c.txt"]);
  });

  it("normalizes file paths before checking staged set", () => {
    const staged = new Set(["a/b.txt", "c/d/e.ts"]);
    const res = getStagedFilesInGroup(["a\\b.txt", "c\\d\\e.ts"], staged);
    expect(res).toEqual(["a/b.txt", "c/d/e.ts"]);
  });

  it("does not match when staged set contains non-normalized paths", () => {
    const staged = new Set(["a\\b.txt"]);
    const res = getStagedFilesInGroup(["a\\b.txt"], staged);
    expect(res).toEqual([]);
  });

  it("keeps duplicates if the input contains duplicates", () => {
    const staged = new Set(["x.txt"]);
    const res = getStagedFilesInGroup(["x.txt", "x.txt"], staged);
    expect(res).toEqual(["x.txt", "x.txt"]);
  });
});

// ─── GitCliClient — new methods ───────────────────────────────────────────────

describe("GitCliClient — getStagedPaths", () => {
  it("returns empty set for empty output", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "status --porcelain=v1 -z") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.getStagedPaths("/repo");
    expect(res.size).toBe(0);
  });

  it("parses staged entries from porcelain v1 -z", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "status --porcelain=v1 -z") {
        return { stdout: "M  file1\0A  file2\0 M file3\0?? file4\0" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.getStagedPaths("/repo");
    expect([...res]).toEqual(["file1", "file2"]);
  });

  it("normalizes backslashes to forward slashes", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "status --porcelain=v1 -z") {
        return { stdout: "M  a\\b\\c.txt\0" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.getStagedPaths("/repo");
    expect([...res]).toEqual(["a/b/c.txt"]);
  });
});

describe("GitCliClient — getUntrackedPaths", () => {
  it("runs ls-files and parses NUL-separated output", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args.join(" ") === "ls-files --others --exclude-standard -z") {
        return { stdout: "a.txt\0dir/b.txt\0\0" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.getUntrackedPaths("/repo");

    expect(res).toEqual(["a.txt", "dir/b.txt"]);
    expect(calls[0].args).toEqual(["ls-files", "--others", "--exclude-standard", "-z"]);
  });

  it("normalizes backslashes to forward slashes", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "ls-files --others --exclude-standard -z") {
        return { stdout: "a\\b.txt\0" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.getUntrackedPaths("/repo");
    expect(res).toEqual(["a/b.txt"]);
  });
});

describe("GitCliClient — isNewFileInRepo", () => {
  it("returns false when cat-file succeeds (file exists in HEAD)", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "cat-file") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.isNewFileInRepo("/repo", "a.txt");

    expect(res).toBe(false);
    expect(calls[0].args).toEqual(["cat-file", "-e", "HEAD:a.txt"]);
  });

  it("returns true when cat-file fails (file not in HEAD)", async () => {
    mockExecFileWithRouter((args) => {
      if (args[0] === "cat-file") {
        return new Error("not found");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.isNewFileInRepo("/repo", "new.txt");
    expect(res).toBe(true);
  });
});

describe("GitCliClient — fileExistsAtRef", () => {
  it("returns true when cat-file succeeds", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "cat-file") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.fileExistsAtRef("/repo", "HEAD", "a.txt");

    expect(res).toBe(true);
    expect(calls[0].args).toEqual(["cat-file", "-e", "HEAD:a.txt"]);
  });

  it("returns false when cat-file fails", async () => {
    mockExecFileWithRouter((args) => {
      if (args[0] === "cat-file") {
        return new Error("not found");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.fileExistsAtRef("/repo", "HEAD", "missing.txt");
    expect(res).toBe(false);
  });
});

describe("GitCliClient — getHeadMessage", () => {
  it("returns trimmed last commit message", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "log" && args[1] === "-1") {
        return { stdout: "hello\n\n" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const msg = await git.getHeadMessage("/repo");

    expect(msg).toBe("hello");
    expect(calls[0].args).toEqual(["log", "-1", "--pretty=%B"]);
  });
});

describe("GitCliClient — isHeadEmptyVsParent", () => {
  it("returns false when HEAD has no parent (first commit)", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "rev-parse --verify HEAD^") {
        return new Error("fatal: Needed a single revision");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.isHeadEmptyVsParent("/repo");
    expect(res).toBe(false);
  });

  it("returns true when diff is quiet (no changes vs parent)", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args.join(" ") === "rev-parse --verify HEAD^") {
        return { stdout: "abc\n" };
      }
      if (args.join(" ") === "diff --quiet HEAD^ HEAD") {
        return { stdout: "" }; // exit 0 => no diff
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.isHeadEmptyVsParent("/repo");

    expect(res).toBe(true);
    expect(calls.map((c) => c.args.join(" "))).toContain("diff --quiet HEAD^ HEAD");
  });

  it("returns false when diff exits with error (changes exist)", async () => {
    mockExecFileWithRouter((args) => {
      if (args.join(" ") === "rev-parse --verify HEAD^") {
        return { stdout: "abc\n" };
      }
      if (args.join(" ") === "diff --quiet HEAD^ HEAD") {
        return new Error("git diff failed: (code 1)");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    const res = await git.isHeadEmptyVsParent("/repo");
    expect(res).toBe(false);
  });
});

describe("GitCliClient — commit", () => {
  it("runs git commit with provided args", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "commit") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.commit("/repo", ["-m", "Initial commit"]);

    expect(calls[0].args).toEqual(["commit", "-m", "Initial commit"]);
    expect(calls[0].cwd).toBe("/repo");
  });

  it("runs git commit --amend with args", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "commit") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.commit("/repo", ["--amend", "-m", "Fixed message"]);

    expect(calls[0].args).toEqual(["commit", "--amend", "-m", "Fixed message"]);
  });
});

describe("GitCliClient — push", () => {
  it("uses plain push when it succeeds (amend=false)", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "push") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.push("/repo", { amend: false });

    expect(calls[0].args).toEqual(["push"]);
  });

  it("uses force-with-lease when amend=true", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "push") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.push("/repo", { amend: true });

    expect(calls[0].args).toEqual(["push", "--force-with-lease"]);
  });

  it("falls back to push -u origin <branch> when upstream missing (amend=false)", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "push" && args.length === 1) {
        return new Error("fatal: The current branch foo has no upstream branch.");
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return { stdout: "feature/test-branch\n" };
      }
      if (args[0] === "push" && args.includes("-u")) {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.push("/repo", { amend: false });

    expect(calls.some((c) => c.args.join(" ") === "push -u origin feature/test-branch")).toBe(true);
  });

  it("falls back with --force-with-lease when upstream missing and amend=true", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "push" && args[1] === "--force-with-lease" && args.length === 2) {
        return new Error("fatal: has no upstream branch");
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return { stdout: "main\n" };
      }
      if (args[0] === "push" && args.includes("-u")) {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.push("/repo", { amend: true });

    expect(
      calls.some((c) =>
        c.args.join(" ") === "push -u origin main --force-with-lease",
      ),
    ).toBe(true);
  });

  it("rethrows errors that are not upstream-related", async () => {
    mockExecFileWithRouter((args) => {
      if (args[0] === "push") {
        return new Error("fatal: some other push error");
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await expect(git.push("/repo", { amend: false })).rejects.toThrow(
      "fatal: some other push error",
    );
  });

  it("throws on detached HEAD during upstream fallback", async () => {
    mockExecFileWithRouter((args) => {
      if (args[0] === "push") {
        return new Error("has no upstream branch");
      }
      if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
        return { stdout: "HEAD\n" }; // detached
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await expect(git.push("/repo", { amend: false })).rejects.toThrow(
      "Detached HEAD: cannot push without a branch.",
    );
  });
});

describe("GitCliClient — discardFiles", () => {
  it("is a no-op for empty list", async () => {
    const { calls } = mockExecFileWithRouter(() => {
      return new Error("should not be called");
    });

    const git = new GitCliClient();
    await git.discardFiles("/repo", []);

    expect(calls.length).toBe(0);
  });

  it("runs git restore --staged --worktree -- <paths>", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "restore") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.discardFiles("/repo", ["a.txt", "b/c.ts"]);

    expect(calls[0].args).toEqual([
      "restore",
      "--staged",
      "--worktree",
      "--",
      "a.txt",
      "b/c.ts",
    ]);
    expect(calls[0].cwd).toBe("/repo");
  });
});