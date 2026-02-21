import * as vscode from "vscode";

import { GitCliClient } from "../adapters/git/gitCliClient";
import { WorkspaceStateStore } from "../adapters/storage/workspaceStateStore";

import { VsCodeFsStat } from "../adapters/vscode/fsStat";
import { VsCodePrompt } from "../adapters/vscode/prompt";
import { VsCodeSettings } from "../adapters/vscode/settings";

import { CreateChangelist } from "../usecases/createChangelist";
import { DeleteChangelist } from "../usecases/deleteChangelist";
import { LoadOrInitState } from "../usecases/loadOrInitState";
import { MoveFilesToChangelist } from "../usecases/moveFilesToChangelist";
import { ReconcileWithGitStatus } from "../usecases/reconcileWithGitStatus";

import { ChangelistTreeProvider } from "../views/changelistTreeProvider";
import { StashesTreeProvider } from "../views/stash/stashesTreeProvider";
import { WorklistDecorationProvider } from "../views/worklistDecorationProvider";

import { DiffTabTracker } from "../adapters/vscode/diffTabTracker";
import { CloseDiffTabs } from "../usecases/closeDiffTabs";

import { RefreshCoordinator } from "../core/refresh/refreshCoordinator";
import { HandleNewFilesCreated } from "../usecases/handleNewFilesCreated";

import { PendingStageOnSave } from "../adapters/vscode/pendingStageOnSave";
import { RestageAlreadyStaged } from "../usecases/restageAlreadyStaged";
import { Deps } from "./types";

// Note: views/commitViewProvider created later in registerCommitView.ts
export async function createDeps(
  context: vscode.ExtensionContext,
): Promise<Deps | undefined> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  const git = new GitCliClient();
  const store = new WorkspaceStateStore(context.workspaceState);

  const createChangelist = new CreateChangelist(store);
  const moveFiles = new MoveFilesToChangelist(store);
  const deleteChangelist = new DeleteChangelist(git, store);

  let repoRoot: string;
  try {
    repoRoot = await git.getRepoRoot(workspaceFolder.uri.fsPath);
  } catch (e) {
    console.error("Git Worklists: not a git repo?", e);
    return;
  }

  const gitDir = await git.getGitDir(repoRoot);

  const fsStat = new VsCodeFsStat();
  const settings = new VsCodeSettings();
  const prompt = new VsCodePrompt();

  const diffTabTracker = new DiffTabTracker();
  const closeDiffTabs = new CloseDiffTabs(diffTabTracker);

  const treeProvider = new ChangelistTreeProvider(store);
  treeProvider.setRepoRoot(repoRoot);

  const treeView = vscode.window.createTreeView("gitWorklists.changelists", {
    treeDataProvider: treeProvider,
  });

  const deco = new WorklistDecorationProvider(store);
  deco.setRepoRoot(repoRoot);

  const stashesProvider = new StashesTreeProvider(repoRoot, git);

  // Use cases
  const loadOrInit = new LoadOrInitState(git, store);
  const reconcile = new ReconcileWithGitStatus(git, store);

  const coordinator = new RefreshCoordinator(async () => {
    //  ensure state exists
    await loadOrInit.run(repoRoot);

    //  reconcile lists with git status
    await reconcile.run(repoRoot);

    //  refresh tree UI
    treeProvider.refresh();

    // refresh file decorations
    deco.refreshAll();
  }, 200);

  const restageAlreadyStaged = new RestageAlreadyStaged(git);

  const pendingStageOnSave = new PendingStageOnSave();

  const newFileHandler = new HandleNewFilesCreated({
    repoRoot,
    moveFiles,
    coordinator,
    settings,
    prompt,
    pendingStageOnSave,
  });

  // commitView set in registerCommitView.ts
  const deps: Deps = {
    context,
    workspaceFolder,
    repoRoot,
    gitDir,
    git,
    store,
    fsStat,
    settings,
    prompt,
    createChangelist,
    moveFiles,
    deleteChangelist,
    loadOrInit,
    reconcile,
    restageAlreadyStaged,
    treeProvider,
    treeView,
    deco,
    stashesProvider,
    commitView: undefined as any, // assigned later
    diffTabTracker,
    closeDiffTabs,
    coordinator,
    newFileHandler,
    pendingStageOnSave,
  };

  return deps;
}
