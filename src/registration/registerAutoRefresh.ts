import * as vscode from "vscode";
import { AutoRefreshController } from "../adapters/vscode/autoRefreshController";
import { Deps } from "../app/types";

export function registerAutoRefresh(
  deps: Deps,
  doRefresh: () => Promise<void>,
) {
  const auto = new AutoRefreshController(
    { workspace: vscode.workspace, RelativePattern: vscode.RelativePattern },
    deps.repoRoot,
    deps.gitDir,
    doRefresh,
  );

  auto.start();
  deps.context.subscriptions.push(auto);
}
