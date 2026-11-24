import { describe, it, expect } from "vitest";
import { RenameMapping } from "../../../../core/rename/renameMapping";

describe("RenameMapping", () => {
  it("resolves the recorded oldPath for a newPath", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");

    expect(mapping.resolveOldPath("/repo", "new.ts")).toBe("old.ts");
  });

  it("returns undefined for an unknown path", () => {
    const mapping = new RenameMapping();
    expect(mapping.resolveOldPath("/repo", "unknown.ts")).toBeUndefined();
  });

  it("isolates entries per repository", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo1", "old.ts", "new.ts");

    expect(mapping.resolveOldPath("/repo1", "new.ts")).toBe("old.ts");
    expect(mapping.resolveOldPath("/repo2", "new.ts")).toBeUndefined();
  });

  it("normalizes backslashes on both record and lookup", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "src\\old.ts", "src/new.ts");

    expect(mapping.resolveOldPath("/repo", "src\\new.ts")).toBe("src/old.ts");
  });

  it("pruneRepo removes entries whose oldPath fails the predicate", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "stale.ts", "stale-new.ts");
    mapping.record("/repo", "fresh.ts", "fresh-new.ts");

    mapping.pruneRepo("/repo", (oldPath) => oldPath === "fresh.ts");

    expect(mapping.resolveOldPath("/repo", "stale-new.ts")).toBeUndefined();
    expect(mapping.resolveOldPath("/repo", "fresh-new.ts")).toBe("fresh.ts");
  });

  it("pruneRepo only affects the given repository", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo1", "old.ts", "new.ts");
    mapping.record("/repo2", "old.ts", "new.ts");

    mapping.pruneRepo("/repo1", () => false);

    expect(mapping.resolveOldPath("/repo1", "new.ts")).toBeUndefined();
    expect(mapping.resolveOldPath("/repo2", "new.ts")).toBe("old.ts");
  });

  it("entries returns all current pairs for a repo", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "a-old.ts", "a-new.ts");
    mapping.record("/repo", "b-old.ts", "b-new.ts");

    expect(mapping.entries("/repo")).toEqual(
      expect.arrayContaining([
        { oldPath: "a-old.ts", newPath: "a-new.ts" },
        { oldPath: "b-old.ts", newPath: "b-new.ts" },
      ]),
    );
  });

  it("entries returns an empty array for an unknown repo", () => {
    const mapping = new RenameMapping();
    expect(mapping.entries("/unknown")).toEqual([]);
  });

  it("entries is isolated per repository", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo1", "old.ts", "new.ts");
    mapping.record("/repo2", "other-old.ts", "other-new.ts");

    expect(mapping.entries("/repo1")).toEqual([
      { oldPath: "old.ts", newPath: "new.ts" },
    ]);
  });

  it("hasOldPath returns true for a recorded oldPath", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");

    expect(mapping.hasOldPath("/repo", "old.ts")).toBe(true);
  });

  it("hasOldPath returns false for an unknown path", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "old.ts", "new.ts");

    expect(mapping.hasOldPath("/repo", "unknown.ts")).toBe(false);
    expect(mapping.hasOldPath("/repo", "new.ts")).toBe(false);
  });

  it("hasOldPath is isolated per repository", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo1", "old.ts", "new.ts");

    expect(mapping.hasOldPath("/repo1", "old.ts")).toBe(true);
    expect(mapping.hasOldPath("/repo2", "old.ts")).toBe(false);
  });

  it("hasOldPath normalizes backslashes", () => {
    const mapping = new RenameMapping();
    mapping.record("/repo", "src\\old.ts", "src/new.ts");

    expect(mapping.hasOldPath("/repo", "src/old.ts")).toBe(true);
  });
});
