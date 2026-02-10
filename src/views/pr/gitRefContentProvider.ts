import * as vscode from "vscode";
import { gitCapture } from "../../adapters/git/gitShow";

export class GitRefContentProvider
  implements vscode.TextDocumentContentProvider
{
  static scheme = "gitworklists-ref";

  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this._onDidChange.event;

  constructor(private readonly repoRoot: string) {}

  // URI format:
  // gitworklists-ref:/<path>?ref=<ref>
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const qs = new URLSearchParams(uri.query);
    const ref = qs.get("ref") ?? "";
    const path = uri.path.replace(/^\/+/, ""); // remove leading "/"
    if (!ref || !path) {
      return "";
    }

    // git show ref:path
    try {
      return await gitCapture(this.repoRoot, ["show", `${ref}:${path}`]);
    } catch {
      // file may be new/deleted; for "deleted" on one side return empty
      return "";
    }
  }
}
