import * as vscode from "vscode";
import { Deps } from "../app/types";

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
}
