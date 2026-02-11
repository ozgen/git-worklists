import * as vscode from "vscode";
import { WorkspaceStateStore } from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";

export class WorklistDecorationProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  private repoRootFsPath?: string;

  constructor(private readonly store: WorkspaceStateStore) {}

  setRepoRoot(repoRootFsPath: string) {
    this.repoRootFsPath = repoRootFsPath;
    this._onDidChange.fire([]);
  }

  refreshAll() {
    this._onDidChange.fire([]);
  }

  async provideFileDecoration(uri: vscode.Uri): Promise<vscode.FileDecoration | undefined> {
    if (!this.repoRootFsPath) {return;}

    const state = await this.store.load(this.repoRootFsPath);
    if (!state || state.version !== 1) {return;}

    const rel = toRepoRelPath(this.repoRootFsPath, uri);
    if (!rel) {return;}

    // Build lookup: path -> list (first match wins)
    // Priority: Unversioned > Default > Custom 
    const unv = state.lists.find((l) => l.id === SystemChangelist.Unversioned);
    if (unv?.files.includes(rel)) {
      return new vscode.FileDecoration(
        "U",
        "Unversioned",
        new vscode.ThemeColor("gitDecoration.untrackedResourceForeground"),
      );
    }

    const def = state.lists.find((l) => l.id === SystemChangelist.Default);
    if (def?.files.includes(rel)) {
      return new vscode.FileDecoration(
        "D",
        "In Changes",
        new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"),
      );
    }

    // Custom lists
    const custom = state.lists.find(
      (l) =>
        l.id !== SystemChangelist.Unversioned &&
        l.id !== SystemChangelist.Default &&
        l.files.includes(rel),
    );

    if (custom) {
      const badge = badgeFromName(custom.name); // e.g. first letter, or "L"
      return new vscode.FileDecoration(
        badge,
        `In ${custom.name}`,
        new vscode.ThemeColor("gitDecoration.addedResourceForeground"),
      );
    }

    return;
  }
}

function normalizeRepoRelPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function toRepoRelPath(repoRootFsPath: string, uri: vscode.Uri): string {
  const root = normalizeRepoRelPath(repoRootFsPath).replace(/\/+$/, "");
  const full = normalizeRepoRelPath(uri.fsPath);

  if (full === root) {return "";}
  if (!full.startsWith(root + "/")) {return "";}

  return full.slice(root.length + 1);
}

function badgeFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {return "L";}
  const ch = trimmed[0]?.toUpperCase();
  // badge must be short; 1 char is safest
  return /^[A-Z0-9]$/.test(ch) ? ch : "L";
}
