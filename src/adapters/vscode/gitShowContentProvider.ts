import * as vscode from "vscode";
import { GitClient } from "../git/gitClient";

export class GitShowContentProvider
  implements vscode.TextDocumentContentProvider
{
  static scheme = "gitworklists-show";

  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly git: GitClient,
    private readonly repoRoot: string,
  ) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const parts = uri.path.split("/").filter(Boolean);
    const ref = decodeURIComponent(parts[0] ?? "HEAD");
    const repoRel = decodeURIComponent(parts.slice(1).join("/"));

    // Special ref for “no left content” (added files / first commit)
    if (ref === "EMPTY") {
      return "";
    }

    // Use optional show to avoid crashing when file doesn not exist at ref
    const txt = await this.git.showFileAtRefOptional(
      this.repoRoot,
      ref,
      repoRel,
    );

    return txt ?? "";
  }

  refresh(uri: vscode.Uri) {
    this._onDidChange.fire(uri);
  }
}
