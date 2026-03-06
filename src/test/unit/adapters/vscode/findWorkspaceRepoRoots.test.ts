import * as path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
  }

  return {
    FileType,
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
        fsPath: path.join(base.fsPath, ...parts),
      }),
    },
    workspace: {
      fs: {
        readDirectory: vi.fn(),
      },
    },
  };
});

import * as vscode from "vscode";
import { findWorkspaceRepoRoots } from "../../../../adapters/vscode/findWorkspaceRepoRoots";

type MockGitCliClient = {
  getRepoRoot: ReturnType<typeof vi.fn>;
};

function makeWorkspaceFolder(fsPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(fsPath),
    name: path.basename(fsPath),
    index: 0,
  } as vscode.WorkspaceFolder;
}

describe("findWorkspaceRepoRoots", () => {
  const readDirectoryMock = vi.mocked(vscode.workspace.fs.readDirectory);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the workspace repo root when the workspace folder itself is a git repo", async () => {
    readDirectoryMock.mockResolvedValue([]);

    const git: MockGitCliClient = {
      getRepoRoot: vi.fn(async (fsPath: string) => {
        if (fsPath === "/workspace") {
          return "/workspace";
        }

        throw new Error("not a repo");
      }),
    };

    const roots = await findWorkspaceRepoRoots(
      makeWorkspaceFolder("/workspace"),
      git as never,
    );

    expect(roots).toEqual(["/workspace"]);
    expect(git.getRepoRoot).toHaveBeenCalledWith("/workspace");
  });

  it("discovers nested repo roots, sorts them, and removes duplicates", async () => {
    readDirectoryMock.mockImplementation(async (uri: { fsPath: string }) => {
      switch (uri.fsPath) {
        case "/workspace":
          return [
            ["apps", vscode.FileType.Directory],
            ["libs", vscode.FileType.Directory],
          ];
        case "/workspace/apps":
          return [
            ["api", vscode.FileType.Directory],
            ["web", vscode.FileType.Directory],
          ];
        case "/workspace/libs":
          return [["shared", vscode.FileType.Directory]];
        case "/workspace/apps/api":
        case "/workspace/apps/web":
        case "/workspace/libs/shared":
          return [];
        default:
          throw new Error(`unexpected readDirectory: ${uri.fsPath}`);
      }
    });

    const git: MockGitCliClient = {
      getRepoRoot: vi.fn(async (fsPath: string) => {
        switch (fsPath) {
          case "/workspace":
          case "/workspace/apps":
          case "/workspace/libs":
            throw new Error("not a repo");
          case "/workspace/apps/api":
            return "/workspace/apps/api";
          case "/workspace/apps/web":
            return "/workspace/apps/web";
          case "/workspace/libs/shared":
            return "/workspace/apps/api"; 
          default:
            throw new Error(`unexpected getRepoRoot: ${fsPath}`);
        }
      }),
    };

    const roots = await findWorkspaceRepoRoots(
      makeWorkspaceFolder("/workspace"),
      git as never,
    );

    expect(roots).toEqual(["/workspace/apps/api", "/workspace/apps/web"]);
  });

  it("skips excluded directories and ignores non-directory entries", async () => {
    readDirectoryMock.mockImplementation(async (uri: { fsPath: string }) => {
      switch (uri.fsPath) {
        case "/workspace":
          return [
            ["node_modules", vscode.FileType.Directory],
            [".git", vscode.FileType.Directory],
            ["dist", vscode.FileType.Directory],
            ["apps", vscode.FileType.Directory],
            ["README.md", vscode.FileType.File],
          ];
        case "/workspace/apps":
          return [["api", vscode.FileType.Directory]];
        case "/workspace/apps/api":
          return [];
        default:
          throw new Error(`unexpected readDirectory: ${uri.fsPath}`);
      }
    });

    const git: MockGitCliClient = {
      getRepoRoot: vi.fn(async (fsPath: string) => {
        if (fsPath === "/workspace/apps/api") {
          return "/workspace/apps/api";
        }

        throw new Error("not a repo");
      }),
    };

    const roots = await findWorkspaceRepoRoots(
      makeWorkspaceFolder("/workspace"),
      git as never,
    );

    expect(roots).toEqual(["/workspace/apps/api"]);

    expect(git.getRepoRoot).not.toHaveBeenCalledWith("/workspace/node_modules");
    expect(git.getRepoRoot).not.toHaveBeenCalledWith("/workspace/.git");
    expect(git.getRepoRoot).not.toHaveBeenCalledWith("/workspace/dist");
    expect(git.getRepoRoot).not.toHaveBeenCalledWith("/workspace/README.md");
  });

  it("ignores unreadable directories and does not discover repos deeper than the scan limit", async () => {
    readDirectoryMock.mockImplementation(async (uri: { fsPath: string }) => {
      switch (uri.fsPath) {
        case "/workspace":
          return [
            ["broken", vscode.FileType.Directory],
            ["a", vscode.FileType.Directory],
          ];
        case "/workspace/broken":
          throw new Error("permission denied");
        case "/workspace/a":
          return [["b", vscode.FileType.Directory]];
        case "/workspace/a/b":
          return [["c", vscode.FileType.Directory]];
        case "/workspace/a/b/c":
          return [["d", vscode.FileType.Directory]];
        case "/workspace/a/b/c/d":
          return [["e", vscode.FileType.Directory]];
        case "/workspace/a/b/c/d/e":
          return [["f", vscode.FileType.Directory]];
        default:
          throw new Error(`unexpected readDirectory: ${uri.fsPath}`);
      }
    });

    const git: MockGitCliClient = {
      getRepoRoot: vi.fn(async (fsPath: string) => {
        if (fsPath === "/workspace/a/b/c/d/e/f") {
          return "/workspace/a/b/c/d/e/f";
        }

        throw new Error("not a repo");
      }),
    };

    const roots = await findWorkspaceRepoRoots(
      makeWorkspaceFolder("/workspace"),
      git as never,
    );

    expect(roots).toEqual([]);

    expect(git.getRepoRoot).not.toHaveBeenCalledWith("/workspace/a/b/c/d/e/f");
  });
});
