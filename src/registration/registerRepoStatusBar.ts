import * as path from "path";
import * as vscode from "vscode";

import { Deps } from "../app/types";

export function registerRepoStatusBar(deps: Deps) {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );

  item.command = "gitWorklists.switchRepoRoot";
  item.name = "Git Worklists Active Repo";

  const render = () => {
    item.text = `$(list-tree) ${path.basename(deps.repoRoot)}`;
    item.tooltip = `Git Worklists\nActive repository\n${deps.repoRoot}\n\nClick to switch`;
    item.show();
  };

  render();

  deps.context.subscriptions.push(item);
  deps.context.subscriptions.push(
    deps.onDidChangeRepoRoot(() => {
      render();
    }),
  );
}
