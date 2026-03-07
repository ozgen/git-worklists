import { describe, it, expect } from "vitest";
import { buildPatchForLineRange } from "../../../utils/patchBuilder";

describe("buildPatchForLineRange", () => {
  it("returns null for empty diff", () => {
    expect(buildPatchForLineRange("", 1, 1)).toBeNull();
    expect(buildPatchForLineRange("   \n", 1, 1)).toBeNull();
  });

  it("returns null when selection does not overlap any stageable changes", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-old line2",
      "+new line2",
      " line3",
      "",
    ].join("\n");

    const patch = buildPatchForLineRange(diff, 1, 1);
    expect(patch).toBeNull();
  });

  it("returns a patch when selection overlaps a modified block", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-old line2",
      "+new line2",
      " line3",
      "",
    ].join("\n");

    const patch = buildPatchForLineRange(diff, 2, 2);

    expect(patch).not.toBeNull();
    expect(patch).toContain("--- a/a.txt");
    expect(patch).toContain("+++ b/a.txt");
    expect(patch).toContain("-old line2");
    expect(patch).toContain("+new line2");
  });

  it("matches against new-side line numbers, not old-side only", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -10,3 +10,4 @@",
      " keep1",
      "-old a",
      "+new a",
      "+new b",
      " keep2",
      "",
    ].join("\n");

    const patch = buildPatchForLineRange(diff, 11, 11);

    expect(patch).not.toBeNull();
    expect(patch).toContain("+new a");
    expect(patch).toContain("+new b");
  });

  it("returns null for pure deletion blocks because they have no new-side lines", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,4 +1,3 @@",
      " line1",
      "-line2",
      " line3",
      " line4",
      "",
    ].join("\n");

    const patch = buildPatchForLineRange(diff, 2, 2);
    expect(patch).toBeNull();
  });

  it("keeps only overlapping change blocks and neutralizes unselected blocks", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,7 +1,7 @@",
      " keep1",
      "-old a",
      "+new a",
      " keep2",
      "-old b",
      "+new b",
      " keep3",
      "",
    ].join("\n");
  
    const patch = buildPatchForLineRange(diff, 4, 4);
  
    expect(patch).not.toBeNull();
  
    expect(patch).toContain("-old b");
    expect(patch).toContain("+new b");
  
    expect(patch).toContain(" old a");
    expect(patch).not.toContain("+new a");
  });

  it("returns only the overlapping hunk when diff contains multiple hunks", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-old line2",
      "+new line2",
      " line3",
      "@@ -10,3 +10,3 @@",
      " line10",
      "-old line11",
      "+new line11",
      " line12",
      "",
    ].join("\n");

    const patch = buildPatchForLineRange(diff, 11, 11);

    expect(patch).not.toBeNull();
    expect(patch).toContain("+new line11");
    expect(patch).not.toContain("+new line2");

    const hunkCount = (patch!.match(/^@@/gm) ?? []).length;
    expect(hunkCount).toBe(1);
  });

  it("returns both hunks when selection overlaps both", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-old line2",
      "+new line2",
      " line3",
      "@@ -10,3 +10,3 @@",
      " line10",
      "-old line11",
      "+new line11",
      " line12",
      "",
    ].join("\n");

    const patch = buildPatchForLineRange(diff, 2, 11);

    expect(patch).not.toBeNull();
    expect(patch).toContain("+new line2");
    expect(patch).toContain("+new line11");

    const hunkCount = (patch!.match(/^@@/gm) ?? []).length;
    expect(hunkCount).toBe(2);
  });

  it("preserves diff headers before the first hunk", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-old line2",
      "+new line2",
      " line3",
      "",
    ].join("\n");

    const patch = buildPatchForLineRange(diff, 2, 2);

    expect(patch).not.toBeNull();
    expect(patch!.startsWith("diff --git a/a.txt b/a.txt")).toBe(true);
    expect(patch).toContain("index 1111111..2222222 100644");
    expect(patch).toContain("--- a/a.txt");
    expect(patch).toContain("+++ b/a.txt");
  });

  it("returns null when selection overlaps only context lines", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,5 +1,5 @@",
      " line1",
      "-old line2",
      "+new line2",
      " line3",
      " line4",
      "",
    ].join("\n");

    const patch = buildPatchForLineRange(diff, 4, 4);
    expect(patch).toBeNull();
  });

  it("handles added-only blocks", () => {
    const diff = [
      "diff --git a/a.txt b/a.txt",
      "index 1111111..2222222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,2 +1,3 @@",
      " line1",
      "+inserted line",
      " line2",
      "",
    ].join("\n");

    const patch = buildPatchForLineRange(diff, 2, 2);

    expect(patch).not.toBeNull();
    expect(patch).toContain("+inserted line");
  });
});