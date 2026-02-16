import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    stat: vi.fn(),
    FileType: { File: 1, Directory: 2 },
  };
});

vi.mock("vscode", () => {
  return {
    workspace: {
      fs: {
        stat: mocks.stat,
      },
    },
    FileType: mocks.FileType,
  };
});

import { VsCodeFsStat } from "../../../../adapters/vscode/fsStat";

type FakeUri = { fsPath: string };

function uri(p: string): FakeUri {
  return { fsPath: p };
}

beforeEach(() => {
  mocks.stat.mockReset();
});

describe("VsCodeFsStat.filterOnlyFiles", () => {
  it("returns only URIs that are files", async () => {
    const file1 = uri("/repo/a.txt");
    const dir1 = uri("/repo/folder");
    const file2 = uri("/repo/b.ts");

    mocks.stat.mockImplementation(async (u: FakeUri) => {
      if (u.fsPath === file1.fsPath) {
        return { type: mocks.FileType.File };
      }
      if (u.fsPath === dir1.fsPath) {
        return { type: mocks.FileType.Directory };
      }
      if (u.fsPath === file2.fsPath) {
        return { type: mocks.FileType.File };
      }
      throw new Error("unexpected uri");
    });

    const fsStat = new VsCodeFsStat();
    const out = await fsStat.filterOnlyFiles([
      file1,
      dir1,
      file2,
    ] as unknown as readonly any[]);

    expect(out).toEqual([file1, file2]);
    expect(mocks.stat).toHaveBeenCalledTimes(3);
  });

  it("ignores URIs that throw in stat()", async () => {
    const file1 = uri("/repo/a.txt");
    const missing = uri("/repo/missing.txt");
    const file2 = uri("/repo/b.ts");

    mocks.stat.mockImplementation(async (u: FakeUri) => {
      if (u.fsPath === file1.fsPath) {
        return { type: mocks.FileType.File };
      }
      if (u.fsPath === missing.fsPath) {
        throw new Error("ENOENT");
      }
      if (u.fsPath === file2.fsPath) {
        return { type: mocks.FileType.File };
      }
      throw new Error("unexpected uri");
    });

    const fsStat = new VsCodeFsStat();
    const out = await fsStat.filterOnlyFiles([
      file1,
      missing,
      file2,
    ] as unknown as readonly any[]);

    expect(out).toEqual([file1, file2]);
    expect(mocks.stat).toHaveBeenCalledTimes(3);
  });

  it("treats non-file types as excluded", async () => {
    const u = uri("/repo/something");
    mocks.stat.mockResolvedValue({ type: 0 });

    const fsStat = new VsCodeFsStat();
    const out = await fsStat.filterOnlyFiles([u] as unknown as readonly any[]);

    expect(out).toEqual([]);
    expect(mocks.stat).toHaveBeenCalledTimes(1);
  });

  it("includes when File bit is present (bitmask)", async () => {
    const u = uri("/repo/mixed");
    mocks.stat.mockResolvedValue({
      type: mocks.FileType.File | mocks.FileType.Directory,
    });

    const fsStat = new VsCodeFsStat();
    const out = await fsStat.filterOnlyFiles([u] as unknown as readonly any[]);

    expect(out).toEqual([u]);
    expect(mocks.stat).toHaveBeenCalledTimes(1);
  });
});
