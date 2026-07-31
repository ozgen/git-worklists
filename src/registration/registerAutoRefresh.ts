import * as vscode from "vscode";
import { AutoRefreshController } from "../adapters/vscode/autoRefreshController";
import { Deps } from "../app/types";
import { HandleFilesRenamed } from "../usecases/handleFilesRenamed";
import { recordFileRename } from "../usecases/recordFileRename";

export function registerAutoRefresh(
  deps: Deps,
  doRefresh: () => Promise<void>,
) {
  const renameHandler = new HandleFilesRenamed(deps.store, () => deps.repoRoot, deps.git);

  const auto = new AutoRefreshController(
    { workspace: vscode.workspace, RelativePattern: vscode.RelativePattern },
    () => deps.repoRoot,
    () => deps.gitDir,
    doRefresh,
    (pairs) => {
      recordFileRename(deps.renameMapping, deps.repoRoot, pairs);
      return renameHandler.run(pairs);
    },
  );

  auto.start();
  deps.context.subscriptions.push(auto);
}
