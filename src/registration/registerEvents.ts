import * as vscode from "vscode";
import { Deps } from "../app/types";
import { normalizeRepoRelPath, toRepoRelPath } from "../utils/paths";

export function registerEvents(deps: Deps) {
  deps.context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(async (e) => {
      try {
        const filesOnly = await deps.fsStat.filterOnlyFiles(e.files);
        if (filesOnly.length === 0) {
          return;
        }

        await deps.newFileHandler.run(filesOnly);
      } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage(
          "Git Worklists: failed handling new file (see console)",
        );
      }
    }),
  );

  deps.context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (doc.uri.scheme !== "file") {
        return;
      }

      const rel = toRepoRelPath(deps.repoRoot, doc.uri);
      if (!rel) {
        return;
      }

      const p = normalizeRepoRelPath(rel);
      const shouldRestage = deps.pendingStageOnSave.consume(deps.repoRoot, p);
      if (!shouldRestage) {
        return;
      }

      try {
        await deps.git.add(deps.repoRoot, p);
        await deps.coordinator.requestNow();
      } catch (e) {
        console.error(e);
        void vscode.window.showErrorMessage(
          "Git Worklists: failed to stage file after save (see console)",
        );
      }
    }),
  );
}
