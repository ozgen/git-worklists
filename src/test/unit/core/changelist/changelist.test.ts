import { describe, it, expect } from "vitest";
import { Changelist } from "../../../../core/changelist/changelist";

describe("Changelist", () => {
  it("normalizes initialFiles to repo-relative forward slashes", () => {
    const cl = new Changelist("default", "Default", [
      "a\\b\\c.txt",
      "x/y/z.ts",
    ]);

    expect(cl.hasFile("a/b/c.txt")).toBe(true);
    expect(cl.hasFile("a\\b\\c.txt")).toBe(true);
    expect(cl.listFiles()).toEqual(["a/b/c.txt", "x/y/z.ts"]);
  });

  it("addFile normalizes paths and deduplicates", () => {
    const cl = new Changelist("id1", "My List");

    cl.addFile("a\\b.txt");
    cl.addFile("a/b.txt");
    expect(cl.listFiles()).toEqual(["a/b.txt"]);
  });

  it("removeFile normalizes paths before deleting", () => {
    const cl = new Changelist("id1", "My List", ["a/b.txt"]);

    cl.removeFile("a\\b.txt");

    expect(cl.hasFile("a/b.txt")).toBe(false);
    expect(cl.listFiles()).toEqual([]);
  });

  it("hasFile normalizes paths", () => {
    const cl = new Changelist("id1", "My List", ["dir/file.ts"]);

    expect(cl.hasFile("dir\\file.ts")).toBe(true);
    expect(cl.hasFile("dir/file.ts")).toBe(true);
    expect(cl.hasFile("dir/other.ts")).toBe(false);
  });

  it("listFiles returns sorted paths", () => {
    const cl = new Changelist("id1", "My List", [
      "z\\b.txt",
      "a\\c.txt",
      "a\\b.txt",
    ]);

    expect(cl.listFiles()).toEqual(["a/b.txt", "a/c.txt", "z/b.txt"]);
  });
});
