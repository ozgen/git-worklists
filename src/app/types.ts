import * as vscode from "vscode";
import { GitCliClient } from "../adapters/git/gitCliClient";
import { WorkspaceStateStore } from "../adapters/storage/workspaceStateStore";
import { VsCodeBookmarkEditor } from "../adapters/vscode/bookmarkEditor";
import { ConventionalCommitsAdapter } from "../adapters/vscode/conventionalCommitsAdapter";
import { DiffTabTracker } from "../adapters/vscode/diffTabTracker";
import { VsCodeFsStat } from "../adapters/vscode/fsStat";
import { PendingStageOnSave } from "../adapters/vscode/pendingStageOnSave";
import { VsCodePrompt } from "../adapters/vscode/prompt";
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
import { ChangelistTreeProvider } from "../views/changelistTreeProvider";
import { CommitViewProvider } from "../views/commitViewProvider";
import { StashesTreeProvider } from "../views/stash/stashesTreeProvider";
import { WorklistDecorationProvider } from "../views/worklistDecorationProvider";
import { BookmarkDecorationProvider } from "../views/bookmark/bookmarkDecorationProvider";

export type GroupArg = {
  list: { id: string; name: string; files: string[] };
};

export type Deps = {
  context: vscode.ExtensionContext;
  workspaceFolder: vscode.WorkspaceFolder;

  repoRoot: string;
  gitDir: string;

  git: GitCliClient;
  store: WorkspaceStateStore;
  fsStat: VsCodeFsStat;
  settings: VsCodeSettings;
  prompt: VsCodePrompt;
  pendingStageOnSave: PendingStageOnSave;
  bookmarkEditor: VsCodeBookmarkEditor;
  bookmarkDeco:BookmarkDecorationProvider;

  createChangelist: CreateChangelist;
  renameChangelist: RenameChangelist;
  restoreFilesToChangelist: RestoreFilesToChangelist;
  moveFiles: MoveFilesToChangelist;
  deleteChangelist: DeleteChangelist;
  loadOrInit: LoadOrInitState;
  reconcile: ReconcileWithGitStatus;
  restageAlreadyStaged: RestageAlreadyStaged;

  setBookmark: SetBookmark;
  jumpToBookmark: JumpToBookmark;
  clearBookmark: ClearBookmark;
  clearAllBookmarks: ClearAllBookmarks;

  treeProvider: ChangelistTreeProvider;
  treeView: vscode.TreeView<any>;
  deco: WorklistDecorationProvider;
  stashesProvider: StashesTreeProvider;
  commitView: CommitViewProvider;
  diffTabTracker: DiffTabTracker;
  closeDiffTabs: CloseDiffTabs;
  conventionalCommits: ConventionalCommitsAdapter;

  coordinator: RefreshCoordinator;
  newFileHandler: HandleNewFilesCreated;

  listRepoRoots(): Promise<string[]>;
  switchRepoRoot(nextRepoRoot: string): Promise<void>;
  onDidChangeRepoRoot: vscode.Event<string>;
};