import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const { spawnMock, spawns } = vi.hoisted(() => {
  type SpawnCall = {
    bin: string;
    args: string[];
    opts: any;
    child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  };

  const spawns: SpawnCall[] = [];

  const spawnMock = vi.fn((bin: string, args: string[], opts: any) => {
    const child = new EventEmitter() as SpawnCall["child"];
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    spawns.push({ bin, args, opts, child });
    return child;
  });

  return { spawnMock, spawns };
});

vi.mock("node:child_process", () => {
  return { spawn: spawnMock };
});

import {
  runCmdCapture,
  runCmd,
  runGhCapture,
} from "../../../utils/process";

beforeEach(() => {
  spawnMock.mockClear();
  spawns.length = 0;
});

describe("runCmdCapture", () => {
  it("captures stdout and resolves on exit code 0", async () => {
    const p = runCmdCapture("/repo", "git", ["status"]);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawns[0].bin).toBe("git");
    expect(spawns[0].args).toEqual(["status"]);
    expect(spawns[0].opts).toMatchObject({
      cwd: "/repo",
      stdio: ["ignore", "pipe", "pipe"],
    });

    spawns[0].child.stdout.emit("data", Buffer.from("hello "));
    spawns[0].child.stdout.emit("data", Buffer.from("world\n"));
    spawns[0].child.emit("close", 0);

    await expect(p).resolves.toBe("hello world\n");
  });

  it("captures stderr+stdout and rejects on non-zero exit code", async () => {
    const p = runCmdCapture("/repo", "git", ["rev-parse", "HEAD"]);

    spawns[0].child.stderr.emit("data", Buffer.from("fatal: nope\n"));
    spawns[0].child.stdout.emit("data", Buffer.from("some out\n"));
    spawns[0].child.emit("close", 128);

    await expect(p).rejects.toThrow("git rev-parse HEAD failed (code 128):");
    await expect(p).rejects.toThrow("fatal: nope");
    await expect(p).rejects.toThrow("some out");
  });

  it("rejects if spawn emits error", async () => {
    const p = runCmdCapture("/repo", "git", ["status"]);

    spawns[0].child.emit("error", new Error("spawn failed"));

    await expect(p).rejects.toThrow("spawn failed");
  });
});

describe("runCmd", () => {
  it("resolves void when underlying command succeeds", async () => {
    const p = runCmd("/repo", "echo", ["hi"]);

    spawns[0].child.stdout.emit("data", Buffer.from("hi\n"));
    spawns[0].child.emit("close", 0);

    await expect(p).resolves.toBeUndefined();
  });

  it("propagates error when underlying command fails", async () => {
    const p = runCmd("/repo", "echo", ["hi"]);

    spawns[0].child.stderr.emit("data", Buffer.from("bad\n"));
    spawns[0].child.emit("close", 2);

    await expect(p).rejects.toThrow("echo hi failed (code 2):");
  });
});

describe("runGhCapture", () => {
  it("uses gh binary and returns output", async () => {
    const p = runGhCapture("/repo", ["pr", "view", "--json", "title"]);

    expect(spawns[0].bin).toBe("gh");
    expect(spawns[0].args).toEqual(["pr", "view", "--json", "title"]);

    spawns[0].child.stdout.emit("data", Buffer.from('{"title":"x"}\n'));
    spawns[0].child.emit("close", 0);

    await expect(p).resolves.toBe('{"title":"x"}\n');
  });
});
