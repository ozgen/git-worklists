import * as vscode from "vscode";
import { Deps } from "../app/types";
import { normalizeRepoRelPath } from "../utils/paths";
import { stagePaths, unstagePaths } from "../git/staged";

export function registerCheckboxes(deps: Deps) {
  deps.treeView.onDidChangeCheckboxState(async (e) => {
    try {
      for (const item of e.items as any[]) {
        const kind = item?.kind;

        // File node: has repoRelativePath
        if (kind === "file" && typeof item?.repoRelativePath === "string") {
          const p = normalizeRepoRelPath(item.repoRelativePath);
          if (item.checkboxState === vscode.TreeItemCheckboxState.Checked) {
            await stagePaths(deps.repoRoot, [p]);
          } else {
            await unstagePaths(deps.repoRoot, [p]);
          }
          continue;
        }

        // Group node: has list.files
        if (kind === "group" && Array.isArray(item?.list?.files)) {
          const files: string[] = item.list.files;
          if (item.checkboxState === vscode.TreeItemCheckboxState.Checked) {
            await stagePaths(deps.repoRoot, files);
          } else {
            await unstagePaths(deps.repoRoot, files);
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
