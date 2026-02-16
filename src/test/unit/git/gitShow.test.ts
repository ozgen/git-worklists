import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  return { execFile: vi.fn() };
});

vi.mock("child_process", () => {
  return { execFile: mocks.execFile };
});

import { gitCapture } from "../../../adapters/git/gitShow";

beforeEach(() => {
  mocks.execFile.mockReset();
});

describe("gitCapture", () => {
  it("resolves stdout on success and calls execFile with expected args", async () => {
    mocks.execFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: any, cb: any) => {
        cb(null, "ok-output\n", "");
      },
    );

    const out = await gitCapture("/repo", ["status", "--porcelain"]);
    expect(out).toBe("ok-output\n");

    expect(mocks.execFile).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mocks.execFile.mock.calls[0];

    expect(cmd).toBe("git");
    expect(args).toEqual(["status", "--porcelain"]);
    expect(opts).toMatchObject({
      cwd: "/repo",
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  });

  it("rejects with stderr when git fails and stderr is non-empty", async () => {
    mocks.execFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: any, cb: any) => {
        cb(new Error("boom"), "", "fatal: bad stuff\n");
      },
    );

    await expect(gitCapture("/repo", ["rev-parse", "HEAD"])).rejects.toThrow(
      "git rev-parse HEAD failed: fatal: bad stuff",
    );
  });

  it("rejects with err.message when stderr is empty", async () => {
    mocks.execFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: any, cb: any) => {
        cb(new Error("some error"), "", "");
      },
    );

    await expect(gitCapture("/repo", ["rev-parse", "HEAD"])).rejects.toThrow(
      "git rev-parse HEAD failed: some error",
    );
  });

  it("trims stderr in error message", async () => {
    mocks.execFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: any, cb: any) => {
        cb(new Error("x"), "", "  fatal: nope  \n");
      },
    );

    await expect(gitCapture("/repo", ["status"])).rejects.toThrow(
      "git status failed: fatal: nope",
    );
  });
});
