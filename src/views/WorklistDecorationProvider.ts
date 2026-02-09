import * as vscode from "vscode";
import { WorkspaceStateStore } from "../adapters/storage/WorkspaceStateStore";
import { SystemChangelist } from "../core/changelist/SystemChangelist";

export class WorklistDecorationProvider
  implements vscode.FileDecorationProvider
{
  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[]
  >();
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

  async provideFileDecoration(
    uri: vscode.Uri,
  ): Promise<vscode.FileDecoration | undefined> {
    if (!this.repoRootFsPath) return;

    const state = await this.store.load(this.repoRootFsPath);
    if (!state) return;

    const rel = vscode.workspace.asRelativePath(uri, false);

    const unversioned = state.lists.find(
      (l) => l.id === SystemChangelist.Unversioned,
    );
    if (unversioned?.files.includes(rel)) {
      return new vscode.FileDecoration(
        "U",
        "Unversioned",
        // TODO:  may change this theme-aware color (not hardcoded red/green) 
        new vscode.ThemeColor("gitDecoration.untrackedResourceForeground"),
      );
    }

    const def = state.lists.find((l) => l.id === SystemChangelist.Default);
    if (def?.files.includes(rel)) {
      return new vscode.FileDecoration(
        "D",
        "In Default changelist",
        new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"),
      );
    }

    return;
  }
}
