import * as vscode from "vscode";

import { createDeps } from "./app/deps";
import { registerViews } from "./registration/registerViews";
import { registerCommitView } from "./registration/registerCommitView";
import { registerRefresh } from "./registration/registerRefresh";
import { registerAutoRefresh } from "./registration/registerAutoRefresh";
import { registerCheckboxes } from "./registration/registerCheckboxes";
import { registerCommands } from "./registration/registerCommands";
import { registerStash } from "./registration/registerStash";
import { registerEvents } from "./registration/registerEvents";
import { PendingStageOnSave } from "./adapters/vscode/pendingStageOnSave";

export async function activate(context: vscode.ExtensionContext) {
  const deps = await createDeps(context);
  if (!deps) {
    return;
  }

  // IMPORTANT: initialize once (idempotent)
  await deps.loadOrInit.run(deps.workspaceFolder.uri.fsPath);

  // providers + content provider
  registerViews(context, deps);

  // commit webview
  registerCommitView(context, deps);

  // refresh pipeline (+ first refresh)
  const { doRefresh } = registerRefresh(deps);
  await deps.coordinator.requestNow();


  // auto refresh
  registerAutoRefresh(deps, doRefresh);

  // checkboxes
  registerCheckboxes(deps);

  // commands
  registerCommands(deps);

  // stash
  registerStash(deps);

  // workspace events
  registerEvents(deps);
}

export function deactivate() {}
