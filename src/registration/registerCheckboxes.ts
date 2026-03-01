import * as vscode from "vscode";
import { Deps } from "../app/types";
import { normalizeRepoRelPath } from "../utils/paths";

export function registerCheckboxes(deps: Deps) {
  deps.treeView.onDidChangeCheckboxState(async (e) => {
    try {
      for (const item of e.items as any[]) {
        const kind = item?.kind;

        // File node: has repoRelativePath
        if (kind === "file" && typeof item?.repoRelativePath === "string") {
          const p = normalizeRepoRelPath(item.repoRelativePath);
          if (item.checkboxState === vscode.TreeItemCheckboxState.Checked) {
            await deps.git.stageMany(deps.repoRoot, [p]);
          } else {
            await deps.git.unstageMany(deps.repoRoot, [p]);
          }
          continue;
        }

        // Group node: has list.files
        if (kind === "group" && Array.isArray(item?.list?.files)) {
          const files: string[] = item.list.files;
          if (item.checkboxState === vscode.TreeItemCheckboxState.Checked) {
            await deps.git.stageMany(deps.repoRoot, files);
          } else {
            await deps.git.unstageMany(deps.repoRoot, files);
          }
        }
      }

      await deps.coordinator.requestNow();
    } catch (err) {
      console.error(err);
      vscode.window.showErrorMessage(
        "Git Worklists: staging via checkbox failed (see console)",
      );
    }
  });
}
