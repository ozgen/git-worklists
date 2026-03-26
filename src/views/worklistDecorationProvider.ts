import * as vscode from "vscode";
import { FileStageState } from "../adapters/git/gitClient";
import { WorkspaceStateStore } from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";
import { normalizeRepoRelPath } from "../utils/paths";

type PersistedChangelist = {
  id: string;
  name: string;
  files: string[];
};

type PersistedStateV1 = {
  version: 1;
  lists: PersistedChangelist[];
};

export class WorklistDecorationProvider
  implements vscode.FileDecorationProvider
{
  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  private repoRootFsPath?: string;
  private fileStageStates = new Map<string, FileStageState>();
  private state?: PersistedStateV1;

  constructor(private readonly store: WorkspaceStateStore) {}

  setRepoRoot(repoRootFsPath: string) {
    this.repoRootFsPath = repoRootFsPath;
    this._onDidChange.fire(undefined);
  }

  updateSnapshot(args: {
    state: unknown;
    fileStageStates: Map<string, FileStageState>;
  }) {
    const normalized = new Map<string, FileStageState>();
    for (const [p, s] of args.fileStageStates) {
      normalized.set(normalizeRepoRelPath(p), s);
    }

    this.fileStageStates = normalized;
    this.state =
      args.state &&
      typeof args.state === "object" &&
      (args.state as PersistedStateV1).version === 1
        ? (args.state as PersistedStateV1)
        : undefined;

    this._onDidChange.fire(undefined);
  }

  provideFileDecoration(
    uri: vscode.Uri,
  ): vscode.ProviderResult<vscode.FileDecoration | undefined> {
    if (!this.repoRootFsPath || !this.state) {
      return;
    }

    const rel = toRepoRelPath(this.repoRootFsPath, uri);
    if (!rel) {
      return;
    }

    const normalizedRel = normalizeRepoRelPath(rel);
    const stageState = this.fileStageStates.get(normalizedRel) ?? "none";
    const lists = this.state.lists;

    const unversioned = lists.find(
      (l) => l.id === SystemChangelist.Unversioned,
    );
    if (unversioned?.files.includes(normalizedRel)) {
      return new vscode.FileDecoration(
        "U",
        stageState === "all"
          ? "Unversioned • Staged"
          : stageState === "partial"
            ? "Unversioned • Partially staged"
            : "Unversioned",
        undefined,
      );
    }

    const defaultList = lists.find((l) => l.id === SystemChangelist.Default);
    if (defaultList?.files.includes(normalizedRel)) {
      return decorationForList("D", "Default", stageState);
    }

    const customList = lists.find(
      (l) =>
        l.id !== SystemChangelist.Unversioned &&
        l.id !== SystemChangelist.Default &&
        l.files.includes(normalizedRel),
    );

    if (customList) {
      return decorationForList(
        badgeFromName(customList.name),
        customList.name,
        stageState,
      );
    }

    return;
  }
}

function decorationForList(
  badge: string,
  listName: string,
  stageState: FileStageState,
): vscode.FileDecoration {
  const base = listName === "Default" ? "In Changes" : `In ${listName}`;

  const suffix =
    stageState === "all"
      ? " • Staged"
      : stageState === "partial"
        ? " • Partially staged"
        : "";

  return new vscode.FileDecoration(badge, `${base}${suffix}`, undefined);
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
