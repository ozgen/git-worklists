import { afterEach, describe, it, expect, vi } from "vitest";
import { normalizeRepoRelPath, toRepoRelPath } from "../../../utils/paths";

type UriLike = { fsPath: string };

describe("normalizeRepoRelPath", () => {
  it("replaces backslashes with forward slashes", () => {
    expect(normalizeRepoRelPath("a\\b\\c.txt")).toBe("a/b/c.txt");
  });

  it("keeps forward slashes unchanged", () => {
    expect(normalizeRepoRelPath("a/b/c.txt")).toBe("a/b/c.txt");
  });
});

describe("toRepoRelPath", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["C:/Users/Test/repo", "c:\\Users\\Test\\repo\\src\\App.ts"],
    ["c:\\Users\\Test\\repo\\", "C:/Users/Test/repo/src/App.ts"],
    ["C:/", "c:\\src\\App.ts"],
  ])("handles Windows drive-letter casing: %s", (repoRoot, fsPath) => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(toRepoRelPath(repoRoot, { fsPath } as any)).toBe("src/App.ts");
  });

  it.each([
    "c:\\repo",
    "c:\\repo-other\\App.ts",
    "D:\\repo\\App.ts",
    "c:\\Repo\\App.ts",
  ])("rejects Windows roots and paths outside the repository: %s", (fsPath) => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    expect(toRepoRelPath("C:/repo", { fsPath } as any)).toBe("");
  });

  it.each(["linux", "darwin"])(
    "keeps comparisons case-sensitive on %s",
    (platform) => {
      vi.stubGlobal("process", { ...process, platform });
      expect(toRepoRelPath("C:/repo", { fsPath: "c:/repo/App.ts" } as any)).toBe("");
      expect(toRepoRelPath("/Repo", { fsPath: "/repo/App.ts" } as any)).toBe("");
    },
  );

  it("returns empty string when uri is exactly repoRoot", () => {
    const repoRoot = "/repo";
    const uri: UriLike = { fsPath: "/repo" };
    expect(toRepoRelPath(repoRoot, uri as any)).toBe("");
  });

  it("returns empty string when uri is outside repoRoot", () => {
    const repoRoot = "/repo";
    const uri: UriLike = { fsPath: "/other/file.txt" };
    expect(toRepoRelPath(repoRoot, uri as any)).toBe("");
  });

  it("returns repo-relative path when inside repoRoot", () => {
    const repoRoot = "/repo";
    const uri: UriLike = { fsPath: "/repo/src/index.ts" };
    expect(toRepoRelPath(repoRoot, uri as any)).toBe("src/index.ts");
  });

  it("handles repoRoot with trailing slashes", () => {
    const repoRoot = "/repo///";
    const uri: UriLike = { fsPath: "/repo/a/b.txt" };
    expect(toRepoRelPath(repoRoot, uri as any)).toBe("a/b.txt");
  });

  it("normalizes backslashes in repoRoot and uri.fsPath", () => {
    const repoRoot = "C:\\repo\\";
    const uri: UriLike = { fsPath: "C:\\repo\\src\\main.ts" };
    expect(toRepoRelPath(repoRoot, uri as any)).toBe("src/main.ts");
  });

  it("does not treat prefix paths as inside (e.g. /repo vs /repo2)", () => {
    const repoRoot = "/repo";
    const uri: UriLike = { fsPath: "/repo2/file.txt" };
    expect(toRepoRelPath(repoRoot, uri as any)).toBe("");
  });
});
