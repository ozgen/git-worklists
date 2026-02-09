import * as vscode from "vscode";
import { GitCliClient } from "./adapters/git/GitCliClient";
import { WorkspaceStateStore } from "./adapters/storage/WorkspaceStateStore";
import { InitializeWorkspace } from "./usecases/InitializeWorkspace";
import { ChangelistTreeProvider } from "./views/ChangelistTreeProvider";
import { WorklistDecorationProvider } from "./views/WorklistDecorationProvider";
import { RefreshCoordinator } from "./core/refresh/RefreshCoordinator";
import { AutoRefreshController } from "./core/refresh/AutoRefreshController";

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const git = new GitCliClient();
  const store = new WorkspaceStateStore(context.workspaceState);

  let repoRoot: string;
  try {
    repoRoot = await git.getRepoRoot(workspaceFolder.uri.fsPath);
  } catch (e) {
    console.error("Git Worklists: not a git repo?", e);
    return;
  }

  const gitDir = await git.getGitDir(repoRoot);

  const treeProvider = new ChangelistTreeProvider(store);
  treeProvider.setRepoRoot(repoRoot);

  context.subscriptions.push(
    vscode.window.createTreeView("gitWorklists.changelists", {
      treeDataProvider: treeProvider,
    })
  );

  const deco = new WorklistDecorationProvider(store);
  deco.setRepoRoot(repoRoot);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(deco));

  const init = new InitializeWorkspace(git, store);

  const doRefresh = async () => {
    await init.run(workspaceFolder.uri.fsPath);
    treeProvider.refresh();
    deco.refreshAll();
  };

  const coordinator = new RefreshCoordinator(doRefresh, 200);
  context.subscriptions.push(coordinator);

  // Initial refresh
  await coordinator.requestNow();

  // Auto refresh signals
  const auto = new AutoRefreshController(repoRoot, gitDir, () => coordinator.trigger());
  auto.start();
  context.subscriptions.push(auto);

  // Manual refresh fallback
  context.subscriptions.push(
    vscode.commands.registerCommand("gitWorklists.refresh", async () => {
      try {
        await coordinator.requestNow();
      } catch (e) {
        vscode.window.showErrorMessage("Git Worklists: refresh failed (see console)");
        console.error(e);
      }
    })
  );
}

export function deactivate() {}
