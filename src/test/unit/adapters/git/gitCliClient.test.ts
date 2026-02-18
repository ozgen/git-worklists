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
        cb(res, "", "stderr-from-mock");
        return;
      }
      cb(null, res.stdout, res.stderr ?? "");
    },
  );

  return { calls };
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

  it("unstageMany runs git reset -- <paths...>", async () => {
    const { calls } = mockExecFileWithRouter((args) => {
      if (args[0] === "reset" && args[1] === "--") {
        return { stdout: "" };
      }
      return new Error("unexpected command");
    });

    const git = new GitCliClient();
    await git.unstageMany("/repo", ["a.txt", "b/c.ts"]);

    expect(calls[0]).toEqual({
      args: ["reset", "--", "a.txt", "b/c.ts"],
      cwd: "/repo",
    });
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
});
