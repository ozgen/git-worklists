import { describe, expect, it } from "vitest";
import {
    BOOKMARK_SLOTS,
    formatBookmarkTarget,
    isSameBookmarkTarget,
    isValidBookmarkSlot,
    type BookmarkTarget,
} from "../../../../core/bookmark/bookmark";

describe("core/bookmark/bookmark", () => {
  describe("BOOKMARK_SLOTS", () => {
    it("contains slots 1 through 9", () => {
      expect(BOOKMARK_SLOTS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe("isValidBookmarkSlot", () => {
    it("returns true for valid bookmark slots", () => {
      for (const slot of BOOKMARK_SLOTS) {
        expect(isValidBookmarkSlot(slot)).toBe(true);
      }
    });

    it("returns false for values below the valid range", () => {
      expect(isValidBookmarkSlot(0)).toBe(false);
      expect(isValidBookmarkSlot(-1)).toBe(false);
      expect(isValidBookmarkSlot(-100)).toBe(false);
    });

    it("returns false for values above the valid range", () => {
      expect(isValidBookmarkSlot(10)).toBe(false);
      expect(isValidBookmarkSlot(99)).toBe(false);
    });

    it("returns false for non-slot integers", () => {
      expect(isValidBookmarkSlot(11)).toBe(false);
      expect(isValidBookmarkSlot(42)).toBe(false);
    });

    it("returns false for non-integer numbers", () => {
      expect(isValidBookmarkSlot(1.5)).toBe(false);
      expect(isValidBookmarkSlot(8.1)).toBe(false);
    });
  });

  describe("isSameBookmarkTarget", () => {
    const base: BookmarkTarget = {
      repoRelativePath: "src/bookmark.ts",
      line: 10,
      column: 3,
    };

    it("returns true when repoRelativePath, line, and column are all equal", () => {
      expect(
        isSameBookmarkTarget(base, {
          repoRelativePath: "src/bookmark.ts",
          line: 10,
          column: 3,
        }),
      ).toBe(true);
    });

    it("returns false when repoRelativePath differs", () => {
      expect(
        isSameBookmarkTarget(base, {
          repoRelativePath: "src/other.ts",
          line: 10,
          column: 3,
        }),
      ).toBe(false);
    });

    it("returns false when line differs", () => {
      expect(
        isSameBookmarkTarget(base, {
          repoRelativePath: "src/bookmark.ts",
          line: 11,
          column: 3,
        }),
      ).toBe(false);
    });

    it("returns false when column differs", () => {
      expect(
        isSameBookmarkTarget(base, {
          repoRelativePath: "src/bookmark.ts",
          line: 10,
          column: 4,
        }),
      ).toBe(false);
    });

    it("returns false when all fields differ", () => {
      expect(
        isSameBookmarkTarget(base, {
          repoRelativePath: "README.md",
          line: 0,
          column: 0,
        }),
      ).toBe(false);
    });
  });

  describe("formatBookmarkTarget", () => {
    it("formats repoRelativePath, line, and column using 1-based display values", () => {
      expect(
        formatBookmarkTarget({
          repoRelativePath: "src/bookmark.ts",
          line: 0,
          column: 0,
        }),
      ).toBe("src/bookmark.ts:1:1");
    });

    it("adds 1 to both line and column", () => {
      expect(
        formatBookmarkTarget({
          repoRelativePath: "src/bookmark.ts",
          line: 10,
          column: 3,
        }),
      ).toBe("src/bookmark.ts:11:4");
    });

    it("preserves the repo-relative path exactly", () => {
      expect(
        formatBookmarkTarget({
          repoRelativePath: "nested/path/file.ts",
          line: 4,
          column: 8,
        }),
      ).toBe("nested/path/file.ts:5:9");
    });

    it("works with paths at repo root", () => {
      expect(
        formatBookmarkTarget({
          repoRelativePath: "pom.xml",
          line: 2,
          column: 1,
        }),
      ).toBe("pom.xml:3:2");
    });
  });
});
