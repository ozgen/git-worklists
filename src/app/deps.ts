import * as vscode from "vscode";

import { GitCliClient } from "../adapters/git/gitCliClient";
import { WorkspaceStateStore } from "../adapters/storage/workspaceStateStore";

import { VsCodeFsStat } from "../adapters/vscode/fsStat";
import { VsCodePrompt } from "../adapters/vscode/prompt";
import { VsCodeSettings } from "../adapters/vscode/settings";

import { CreateChangelist } from "../usecases/createChangelist";
import { DeleteChangelist } from "../usecases/deleteChangelist";
import { RenameChangelist } from "../usecases/renameChangelist";
import { LoadOrInitState } from "../usecases/loadOrInitState";
import { MoveFilesToChangelist } from "../usecases/moveFilesToChangelist";
import { ReconcileWithGitStatus } from "../usecases/reconcileWithGitStatus";

import { ChangelistTreeProvider } from "../views/changelistTreeProvider";
import { ChangelistDragDrop } from "../views/changelistDragDrop";
import { StashesTreeProvider } from "../views/stash/stashesTreeProvider";
import { WorklistDecorationProvider } from "../views/worklistDecorationProvider";

import { DiffTabTracker } from "../adapters/vscode/diffTabTracker";
import { CloseDiffTabs } from "../usecases/closeDiffTabs";

import { RefreshCoordinator } from "../core/refresh/refreshCoordinator";
import { HandleNewFilesCreated } from "../usecases/handleNewFilesCreated";

import { conventionalCommitsAdapter } from "../adapters/vscode/conventionalCommitsAdapter";
import { PendingStageOnSave } from "../adapters/vscode/pendingStageOnSave";
import { createRepoWatchers } from "../adapters/vscode/repoWatchers";
import { RestageAlreadyStaged } from "../usecases/restageAlreadyStaged";
import { RestoreFilesToChangelist } from "../usecases/stash/restoreFilesToChangelist";
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
  const renameChangelist = new RenameChangelist(store);
  const restoreFilesToChangelist = new RestoreFilesToChangelist(store);
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

  // Forward ref: deps is assigned below. All closures capture `deps` and read
  // deps.repoRoot at call-time so a future switchRepo() mutation is picked up.
  let deps!: Deps;

  let onDndDrop: () => Promise<void> = async () => {};
  const dnd = new ChangelistDragDrop(moveFiles, () => deps.repoRoot, () => onDndDrop());

  const treeView = vscode.window.createTreeView("gitWorklists.changelists", {
    treeDataProvider: treeProvider,
    dragAndDropController: dnd,
  });

  const deco = new WorklistDecorationProvider(store);
  deco.setRepoRoot(repoRoot);

  const stashesProvider = new StashesTreeProvider(repoRoot, git);

  // Use cases
  const loadOrInit = new LoadOrInitState(git, store);
  const reconcile = new ReconcileWithGitStatus(git, store);

  const coordinator = new RefreshCoordinator(async () => {
    await loadOrInit.run(deps.repoRoot);
    await reconcile.run(deps.repoRoot);
    treeProvider.refresh();
    deco.refreshAll();

    const state = await store.load(deps.repoRoot);
    const totalFiles =
      state?.version === 1
        ? state.lists.reduce((sum, l) => sum + l.files.length, 0)
        : 0;
    treeView.badge =
      totalFiles > 0
        ? { value: totalFiles, tooltip: `${totalFiles} changed file(s)` }
        : undefined;
  }, 200);

  onDndDrop = () => coordinator.requestNow();

  const watchers = createRepoWatchers({
    repoRoot,
    gitDir,
    triggerRefresh: () => coordinator.requestNow(),
    debounceMs: 800,
  });

  context.subscriptions.push(watchers);

  const restageAlreadyStaged = new RestageAlreadyStaged(git);

  const pendingStageOnSave = new PendingStageOnSave();

  const newFileHandler = new HandleNewFilesCreated({
    getRepoRoot: () => deps.repoRoot,
    git,
    moveFiles,
    coordinator,
    settings,
    prompt,
    pendingStageOnSave,
  });

  // commitView set in registerCommitView.ts
  deps = {
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
    renameChangelist,
    restoreFilesToChangelist,
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
    conventionalCommits: conventionalCommitsAdapter,
  };

  return deps;
}
