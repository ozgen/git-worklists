import * as vscode from "vscode";

import { createDeps } from "./app/deps";
import { registerAutoRefresh } from "./registration/registerAutoRefresh";
import { registerCheckboxes } from "./registration/registerCheckboxes";
import { registerCommands } from "./registration/registerCommands";
import { registerCommitView } from "./registration/registerCommitView";
import { registerEvents } from "./registration/registerEvents";
import { registerRefresh } from "./registration/registerRefresh";
import { registerRepoStatusBar } from "./registration/registerRepoStatusBar";
import { registerStash } from "./registration/registerStash";
import { registerViews } from "./registration/registerViews";

export async function activate(context: vscode.ExtensionContext) {

  const deps = await createDeps(context);

  if (!deps) {
    console.log("GIT WORKLISTS: no deps");
    return;
  }

  await deps.loadOrInit.run(deps.repoRoot);

  registerViews(context, deps);
  registerCommitView(context, deps);

  const { doRefresh } = registerRefresh(deps);
  await deps.coordinator.requestNow();

  registerAutoRefresh(deps, doRefresh);
  registerCheckboxes(deps);
  registerCommands(deps);
  registerStash(deps);
  registerEvents(deps);
  registerRepoStatusBar(deps);
}

export function deactivate() {}
