import * as vscode from "vscode";
import { GitCliClient } from "../adapters/git/gitCliClient";
import { WorkspaceStateStore } from "../adapters/storage/workspaceStateStore";
import { VsCodeBookmarkEditor } from "../adapters/vscode/bookmarkEditor";
import { conventionalCommitsAdapter } from "../adapters/vscode/conventionalCommitsAdapter";
import { DiffTabTracker } from "../adapters/vscode/diffTabTracker";
import { findWorkspaceRepoRoots } from "../adapters/vscode/findWorkspaceRepoRoots";
import { VsCodeFsStat } from "../adapters/vscode/fsStat";
import { PendingStageOnSave } from "../adapters/vscode/pendingStageOnSave";
import { VsCodePrompt } from "../adapters/vscode/prompt";
import {
  createRepoWatchers,
  RepoWatchers,
} from "../adapters/vscode/repoWatchers";
import { VsCodeSettings } from "../adapters/vscode/settings";
import { RefreshCoordinator } from "../core/refresh/refreshCoordinator";
import { ClearAllBookmarks } from "../usecases/bookmark/clearAllBookmarks";
import { ClearBookmark } from "../usecases/bookmark/clearBookmark";
import { JumpToBookmark } from "../usecases/bookmark/jumpToBookmark";
import { SetBookmark } from "../usecases/bookmark/setBookmark";
import { CloseDiffTabs } from "../usecases/closeDiffTabs";
import { CreateChangelist } from "../usecases/createChangelist";
import { DeleteChangelist } from "../usecases/deleteChangelist";
import { HandleNewFilesCreated } from "../usecases/handleNewFilesCreated";
import { LoadOrInitState } from "../usecases/loadOrInitState";
import { MoveFilesToChangelist } from "../usecases/moveFilesToChangelist";
import { ReconcileWithGitStatus } from "../usecases/reconcileWithGitStatus";
import { RenameChangelist } from "../usecases/renameChangelist";
import { RestageAlreadyStaged } from "../usecases/restageAlreadyStaged";
import { RestoreFilesToChangelist } from "../usecases/stash/restoreFilesToChangelist";
import { ChangelistDragDrop } from "../views/changelistDragDrop";
import { ChangelistTreeProvider } from "../views/changelistTreeProvider";
import { StashesTreeProvider } from "../views/stash/stashesTreeProvider";
import { WorklistDecorationProvider } from "../views/worklistDecorationProvider";
import { Deps } from "./types";
import { BookmarkDecorationProvider } from "../views/bookmark/bookmarkDecorationProvider";

function sortRepoRoots(repoRoots: string[]): string[] {
  return [...new Set(repoRoots)].sort((a, b) => a.localeCompare(b));
}

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

  let repoRoots = sortRepoRoots(
    await findWorkspaceRepoRoots(workspaceFolder, git),
  );

  if (repoRoots.length === 0) {
    console.error("Git Worklists: no git repositories found in workspace");
    return;
  }

  const repoRoot = repoRoots[0];
  const gitDir = await git.getGitDir(repoRoot);

  const fsStat = new VsCodeFsStat();
  const settings = new VsCodeSettings();
  const prompt = new VsCodePrompt();
  const bookmarkEditor = new VsCodeBookmarkEditor();
  const bookmarkDeco = new BookmarkDecorationProvider(store, context);
  bookmarkDeco.setRepoRoot(repoRoot);

  const setBookmark = new SetBookmark(store, prompt);
  const jumpToBookmark = new JumpToBookmark(store, bookmarkEditor, prompt);
  const clearBookmark = new ClearBookmark(store, prompt);
  const clearAllBookmarks = new ClearAllBookmarks(store, prompt);

  const diffTabTracker = new DiffTabTracker();
  const closeDiffTabs = new CloseDiffTabs(diffTabTracker);

  const treeProvider = new ChangelistTreeProvider(store);
  treeProvider.setRepoRoot(repoRoot);

  const deco = new WorklistDecorationProvider(store);
  deco.setRepoRoot(repoRoot);

  const stashesProvider = new StashesTreeProvider(repoRoot, git);

  let deps!: Deps;
  let onDndDrop: () => Promise<void> = async () => {};

  const repoRootChanged = new vscode.EventEmitter<string>();
  context.subscriptions.push(repoRootChanged);

  const dnd = new ChangelistDragDrop(
    moveFiles,
    () => deps.repoRoot,
    () => onDndDrop(),
  );

  const treeView = vscode.window.createTreeView("gitWorklists.changelists", {
    treeDataProvider: treeProvider,
    dragAndDropController: dnd,
  });

  const loadOrInit = new LoadOrInitState(git, store);
  const reconcile = new ReconcileWithGitStatus(git, store);

  const coordinator = new RefreshCoordinator(async () => {
    await loadOrInit.run(deps.repoRoot);
    await reconcile.run(deps.repoRoot);

    const fileStageStates = await git.getFileStageStates(deps.repoRoot);
    treeProvider.setFileStageStates(fileStageStates);
    deco.setFileStageStates(fileStageStates);

    treeProvider.refresh();
    deco.refreshAll();

    if (deps.commitView) {
      deps.commitView.updateState({
        stagedCount: fileStageStates.size,
        lastError: undefined,
      });
    }

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

  let currentWatchers: RepoWatchers = createRepoWatchers({
    repoRoot,
    gitDir,
    triggerRefresh: () => coordinator.requestNow(),
    debounceMs: 800,
  });

  context.subscriptions.push({
    dispose: () => currentWatchers.dispose(),
  });

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
    pendingStageOnSave,
    bookmarkEditor,
    bookmarkDeco,
    createChangelist,
    renameChangelist,
    restoreFilesToChangelist,
    moveFiles,
    deleteChangelist,
    loadOrInit,
    reconcile,
    restageAlreadyStaged,
    setBookmark,
    jumpToBookmark,
    clearBookmark,
    clearAllBookmarks,
    treeProvider,
    treeView,
    deco,
    stashesProvider,
    commitView: undefined as any,
    diffTabTracker,
    closeDiffTabs,
    coordinator,
    newFileHandler,
    conventionalCommits: conventionalCommitsAdapter,

    async listRepoRoots(): Promise<string[]> {
      return [...repoRoots];
    },

    async switchRepoRoot(nextRepoRoot: string): Promise<void> {
      const normalized = nextRepoRoot.trim();
      if (!normalized || normalized === deps.repoRoot) {
        return;
      }

      if (!repoRoots.includes(normalized)) {
        repoRoots = sortRepoRoots([...repoRoots, normalized]);
      }

      const nextGitDir = await git.getGitDir(normalized);

      currentWatchers.dispose();
      currentWatchers = createRepoWatchers({
        repoRoot: normalized,
        gitDir: nextGitDir,
        triggerRefresh: () => coordinator.requestNow(),
        debounceMs: 800,
      });

      deps.repoRoot = normalized;
      deps.gitDir = nextGitDir;

      treeProvider.setRepoRoot(normalized);
      deco.setRepoRoot(normalized);
      stashesProvider.setRepoRoot(normalized);

      repoRootChanged.fire(normalized);
      await coordinator.requestNow();
    },

    onDidChangeRepoRoot: repoRootChanged.event,
  };

  return deps;
}
