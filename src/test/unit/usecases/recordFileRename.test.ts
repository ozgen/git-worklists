import { describe, it, expect } from "vitest";
import { recordFileRename } from "../../../usecases/recordFileRename";
import { RenameMapping } from "../../../core/rename/renameMapping";

describe("recordFileRename", () => {
  it("records every pair, regardless of changelist ownership", () => {
    const mapping = new RenameMapping();

    recordFileRename(mapping, "/repo", [
      { oldRelPath: "old.ts", newRelPath: "new.ts" },
      { oldRelPath: "untracked-old.ts", newRelPath: "untracked-new.ts" },
    ]);

    expect(mapping.resolveOldPath("/repo", "new.ts")).toBe("old.ts");
    expect(mapping.resolveOldPath("/repo", "untracked-new.ts")).toBe(
      "untracked-old.ts",
    );
  });
});
