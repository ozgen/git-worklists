import * as vscode from "vscode";
import { GitClient } from "../git/gitClient";

export class GitShowContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = "gitworklists-show";

  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly git: GitClient, private readonly repoRoot: string) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const parts = uri.path.split("/").filter(Boolean);
    const ref = decodeURIComponent(parts[0] ?? "HEAD");
    const repoRel = decodeURIComponent(parts.slice(1).join("/"));

    return await this.git.showFileAtRef(this.repoRoot, ref, repoRel);
  }

  refresh(uri: vscode.Uri) {
    this._onDidChange.fire(uri);
  }
}
