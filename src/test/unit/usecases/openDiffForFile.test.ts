import { describe, it, expect, vi, beforeEach } from "vitest";

const pathMocks = vi.hoisted(() => {
  return {
    toRepoRelPath: vi.fn(),
    normalizeRepoRelPath: vi.fn(),
  };
});

vi.mock("../../utils/paths", () => {
  return {
    toRepoRelPath: pathMocks.toRepoRelPath,
    normalizeRepoRelPath: pathMocks.normalizeRepoRelPath,
  };
});

const vscodeMocks = vi.hoisted(() => {
  return {
    Uri: {
      file: (fsPath: string) => ({ fsPath, toString: () => fsPath }),
    },
  };
});

vi.mock("vscode", () => {
  return { Uri: vscodeMocks.Uri };
});

import * as vscode from "vscode";
import { OpenDiffForFile } from "../../../usecases/openDiffForFile";

type GitClientMock = {
  showFileAtRef: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  pathMocks.toRepoRelPath.mockReset();
  pathMocks.normalizeRepoRelPath.mockReset();
});

describe("OpenDiffForFile", () => {
  it("returns open-file when uri is outside the repo (toRepoRelPath fails)", async () => {
    const git: any = { showFileAtRef: vi.fn() };

    const uc = new OpenDiffForFile(git);

    const uri = vscode.Uri.file("/other/a.ts") as any;

    const res = await uc.run({ repoRoot: "/repo", uri });

    expect(res).toEqual({ kind: "open-file", uri });
    expect(git.showFileAtRef).not.toHaveBeenCalled();
  });

  it("uses default ref HEAD when ref is not provided", async () => {
    const git: GitClientMock = {
      showFileAtRef: vi.fn().mockResolvedValue("content"),
    };

    pathMocks.toRepoRelPath.mockReturnValue("src/a.ts");
    pathMocks.normalizeRepoRelPath.mockReturnValue("src/a.ts");

    const uc = new OpenDiffForFile(git as any);
    const uri = vscode.Uri.file("/repo/src/a.ts") as any;

    const res = await uc.run({ repoRoot: "/repo", uri });

    expect(git.showFileAtRef).toHaveBeenCalledWith("/repo", "HEAD", "src/a.ts");

    expect(res).toMatchObject({
      kind: "diff",
      leftContent: "content",
      leftLabelPath: "src/a.ts",
      rightUri: uri,
      title: "src/a.ts (HEAD <-> Working Tree)",
    });
  });

  it("uses provided ref in git call and title", async () => {
    const git: GitClientMock = {
      showFileAtRef: vi.fn().mockResolvedValue("old"),
    };

    pathMocks.toRepoRelPath.mockReturnValue("a b.txt");
    pathMocks.normalizeRepoRelPath.mockReturnValue("a b.txt");

    const uc = new OpenDiffForFile(git as any);
    const uri = vscode.Uri.file("/repo/a b.txt") as any;

    const res = await uc.run({ repoRoot: "/repo", uri, ref: "stash@{2}" });

    expect(git.showFileAtRef).toHaveBeenCalledWith(
      "/repo",
      "stash@{2}",
      "a b.txt",
    );

    expect(res).toMatchObject({
      kind: "diff",
      title: "a b.txt (stash@{2} <-> Working Tree)",
      leftContent: "old",
      leftLabelPath: "a b.txt",
      rightUri: uri,
    });
  });

  it("returns open-file when showFileAtRef throws", async () => {
    const git: GitClientMock = {
      showFileAtRef: vi.fn().mockRejectedValue(new Error("missing in ref")),
    };

    pathMocks.toRepoRelPath.mockReturnValue("missing.txt");
    pathMocks.normalizeRepoRelPath.mockReturnValue("missing.txt");

    const uc = new OpenDiffForFile(git as any);
    const uri = vscode.Uri.file("/repo/missing.txt") as any;

    const res = await uc.run({ repoRoot: "/repo", uri, ref: "HEAD" });

    expect(res).toEqual({ kind: "open-file", uri });
    expect(git.showFileAtRef).toHaveBeenCalledWith(
      "/repo",
      "HEAD",
      "missing.txt",
    );
  });

  it("normalizes path before calling git", async () => {
    const git: GitClientMock = {
      showFileAtRef: vi.fn().mockResolvedValue("x"),
    };

    pathMocks.toRepoRelPath.mockReturnValue("src\\win\\path.ts");
    pathMocks.normalizeRepoRelPath.mockReturnValue("src/win/path.ts");

    const uc = new OpenDiffForFile(git as any);
    const uri = vscode.Uri.file("/repo/src/win/path.ts") as any;

    const res = await uc.run({ repoRoot: "/repo", uri });

    expect(git.showFileAtRef).toHaveBeenCalledWith(
      "/repo",
      "HEAD",
      "src/win/path.ts",
    );
    expect(res).toMatchObject({
      kind: "diff",
      leftLabelPath: "src/win/path.ts",
      title: "src/win/path.ts (HEAD <-> Working Tree)",
    });
  });
});
