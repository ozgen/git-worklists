import * as vscode from "vscode";
import { FileStageState } from "../adapters/git/gitClient";
import { WorkspaceStateStore } from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";
import { normalizeRepoRelPath } from "../utils/paths";

export class WorklistDecorationProvider
  implements vscode.FileDecorationProvider
{
  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  private repoRootFsPath?: string;
  private fileStageStates = new Map<string, FileStageState>();

  constructor(private readonly store: WorkspaceStateStore) {}

  setFileStageStates(states: Map<string, FileStageState>) {
    this.fileStageStates = states;
    this._onDidChange.fire(undefined);
  }

  setRepoRoot(repoRootFsPath: string) {
    this.repoRootFsPath = repoRootFsPath;
    this._onDidChange.fire(undefined);
  }

  refreshAll() {
    this._onDidChange.fire(undefined);
  }

  async provideFileDecoration(
    uri: vscode.Uri,
  ): Promise<vscode.FileDecoration | undefined> {
    if (!this.repoRootFsPath) {
      return;
    }

    const state = await this.store.load(this.repoRootFsPath);
    if (!state || state.version !== 1) {
      return;
    }

    const rel = toRepoRelPath(this.repoRootFsPath, uri);
    if (!rel) {
      return;
    }

    const normalizedRel = normalizeRepoRelPath(rel);
    const stageState = this.fileStageStates.get(normalizedRel) ?? "none";

    // Priority: Unversioned > Default > Custom
    const unversioned = state.lists.find(
      (l) => l.id === SystemChangelist.Unversioned,
    );
    if (unversioned?.files.includes(normalizedRel)) {
      return new vscode.FileDecoration(
        "U",
        "Unversioned",
        new vscode.ThemeColor("gitDecoration.untrackedResourceForeground"),
      );
    }

    const defaultList = state.lists.find(
      (l) => l.id === SystemChangelist.Default,
    );
    if (defaultList?.files.includes(normalizedRel)) {
      return decorationForList("D", "Default", stageState);
    }

    const customList = state.lists.find(
      (l) =>
        l.id !== SystemChangelist.Unversioned &&
        l.id !== SystemChangelist.Default &&
        l.files.includes(normalizedRel),
    );

    if (customList) {
      const badge = badgeFromName(customList.name);
      return decorationForList(badge, customList.name, stageState);
    }

    return;
  }
}

function decorationForList(
  badge: string,
  listName: string,
  stageState: FileStageState,
): vscode.FileDecoration {
  if (stageState === "all") {
    return new vscode.FileDecoration(
      badge,
      listName === "Default" ? "Staged" : `Staged in ${listName}`,
      new vscode.ThemeColor("gitDecoration.stagedModifiedResourceForeground"),
    );
  }

  if (stageState === "partial") {
    return new vscode.FileDecoration(
      badge,
      listName === "Default"
        ? "Partially Staged"
        : `Partially Staged in ${listName}`,
      new vscode.ThemeColor("gitDecoration.stagedModifiedResourceForeground"),
    );
  }

  return new vscode.FileDecoration(
    badge,
    listName === "Default" ? "In Changes" : `In ${listName}`,
    new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"),
  );
}

function toRepoRelPath(repoRootFsPath: string, uri: vscode.Uri): string {
  const root = normalizeRepoRelPath(repoRootFsPath).replace(/\/+$/, "");
  const full = normalizeRepoRelPath(uri.fsPath);

  if (full === root) {
    return "";
  }
  if (!full.startsWith(root + "/")) {
    return "";
  }

  return full.slice(root.length + 1);
}

function badgeFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "L";
  }

  const ch = trimmed[0]?.toUpperCase() ?? "L";
  return /^[A-Z0-9]$/.test(ch) ? ch : "L";
}
