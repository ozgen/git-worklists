import { describe, it, expect } from "vitest";
import { replacePathInChangelists } from "../../../../core/changelist/replacePathInChangelists";

describe("replacePathInChangelists", () => {
  it("preserves Default ownership", () => {
    const lists = [{ id: "changes", name: "Changes", files: ["old.ts"] }];

    const result = replacePathInChangelists(lists, "old.ts", "new.ts");

    expect(result.find((l) => l.id === "changes")?.files).toEqual(["new.ts"]);
  });

  it("preserves custom changelist ownership", () => {
    const lists = [{ id: "feature-a", name: "Feature A", files: ["old.ts"] }];

    const result = replacePathInChangelists(lists, "old.ts", "new.ts");

    expect(result.find((l) => l.id === "feature-a")?.files).toEqual(["new.ts"]);
  });

  it("preserves Unversioned ownership", () => {
    const lists = [{ id: "unversioned", name: "Unversioned", files: ["draft.txt"] }];

    const result = replacePathInChangelists(lists, "draft.txt", "draft-renamed.txt");

    expect(result.find((l) => l.id === "unversioned")?.files).toEqual([
      "draft-renamed.txt",
    ]);
  });

  it("does not invent ownership when the old path has no owner", () => {
    const lists = [{ id: "changes", name: "Changes", files: [] }];

    const result = replacePathInChangelists(lists, "old.ts", "new.ts");

    expect(result).toEqual(lists);
  });

  it("removes the old path from every list", () => {
    const lists = [
      { id: "changes", name: "Changes", files: ["old.ts"] },
      { id: "feature-a", name: "Feature A", files: ["old.ts", "unrelated.ts"] },
    ];

    const result = replacePathInChangelists(lists, "old.ts", "new.ts");

    for (const list of result) {
      expect(list.files).not.toContain("old.ts");
    }
  });

  it("does not duplicate the new path if it already exists elsewhere", () => {
    const lists = [
      { id: "changes", name: "Changes", files: ["old.ts"] },
      { id: "feature-a", name: "Feature A", files: ["new.ts"] },
    ];

    const result = replacePathInChangelists(lists, "old.ts", "new.ts");

    const occurrences = result.flatMap((l) => l.files).filter((f) => f === "new.ts");
    expect(occurrences).toHaveLength(1);
    expect(result.find((l) => l.id === "changes")?.files).toEqual(["new.ts"]);
    expect(result.find((l) => l.id === "feature-a")?.files).toEqual([]);
  });

  it("leaves unrelated entries untouched", () => {
    const lists = [{ id: "changes", name: "Changes", files: ["old.ts", "keep.ts"] }];

    const result = replacePathInChangelists(lists, "old.ts", "new.ts");

    expect(result.find((l) => l.id === "changes")?.files).toEqual(["keep.ts", "new.ts"]);
  });

  it("normalizes backslash paths", () => {
    const lists = [{ id: "changes", name: "Changes", files: ["src\\old.ts"] }];

    const result = replacePathInChangelists(lists, "src/old.ts", "src/new.ts");

    expect(result.find((l) => l.id === "changes")?.files).toEqual(["src/new.ts"]);
  });
});
