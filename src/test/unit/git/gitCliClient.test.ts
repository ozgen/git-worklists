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
} from "../../../adapters/git/gitCliClient";

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
});
