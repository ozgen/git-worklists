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
import { CommitViewProvider } from "../views/commitViewProvider";
import { StashesTreeProvider } from "../views/stash/stashesTreeProvider";
import { WorklistDecorationProvider } from "../views/worklistDecorationProvider";

import { DiffTabTracker } from "../adapters/vscode/diffTabTracker";
import { PendingStageOnSave } from "../adapters/vscode/pendingStageOnSave";
import { RefreshCoordinator } from "../core/refresh/refreshCoordinator";
import { CloseDiffTabs } from "../usecases/closeDiffTabs";
import { HandleNewFilesCreated } from "../usecases/handleNewFilesCreated";

export type GroupArg = { list: { id: string; name: string; files: string[] } };

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

  createChangelist: CreateChangelist;
  moveFiles: MoveFilesToChangelist;
  deleteChangelist: DeleteChangelist;

  loadOrInit: LoadOrInitState;
  reconcile: ReconcileWithGitStatus;

  // VS Code providers / UI
  treeProvider: ChangelistTreeProvider;
  treeView: vscode.TreeView<any>;
  deco: WorklistDecorationProvider;
  stashesProvider: StashesTreeProvider;
  commitView: CommitViewProvider;

  diffTabTracker: DiffTabTracker;
  closeDiffTabs: CloseDiffTabs;

  // refresh pipeline
  coordinator: RefreshCoordinator;

  // file creation handler
  newFileHandler: HandleNewFilesCreated;
};
