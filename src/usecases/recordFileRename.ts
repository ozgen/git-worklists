import { RenameMapping } from "../core/rename/renameMapping";
import type { RenamedFilePair } from "./handleFilesRenamed";

export function recordFileRename(
  mapping: RenameMapping,
  repoRoot: string,
  pairs: RenamedFilePair[],
): void {
  for (const { oldRelPath, newRelPath } of pairs) {
    mapping.record(repoRoot, oldRelPath, newRelPath);
  }
}
