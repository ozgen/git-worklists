import * as vscode from "vscode";
import { PullRequestDetails } from "../../core/pr/model/pullRequestDetails";

export type PrDetailsNode =
  | { kind: "root" }
  | { kind: "empty" }
  | { kind: "meta"; label: string }
  | { kind: "filesRoot" }
  | { kind: "file"; path: string };

export class PrDetailsTreeProvider implements vscode.TreeDataProvider<PrDetailsNode> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private details?: PullRequestDetails;

  setDetails(details?: PullRequestDetails) {
    this.details = details;
    this._onDidChange.fire();
  }

  refresh() {
    this._onDidChange.fire();
  }

  getTreeItem(el: PrDetailsNode): vscode.TreeItem {
    if (el.kind === "root") {
      return new vscode.TreeItem(
        "PR Details",
        vscode.TreeItemCollapsibleState.Expanded,
      );
    }
    if (el.kind === "empty") {
      const item = new vscode.TreeItem(
        "Select a PR to see details",
        vscode.TreeItemCollapsibleState.None,
      );
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }
    if (el.kind === "meta") {
      const item = new vscode.TreeItem(
        el.label,
        vscode.TreeItemCollapsibleState.None,
      );
      item.iconPath = new vscode.ThemeIcon("info");
      return item;
    }
    if (el.kind === "filesRoot") {
      const item = new vscode.TreeItem(
        "Files changed",
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.iconPath = new vscode.ThemeIcon("diff");
      return item;
    }

    const item = new vscode.TreeItem(
      el.path,
      vscode.TreeItemCollapsibleState.None,
    );
    item.iconPath = new vscode.ThemeIcon("diff");
    item.command = {
      command: "gitWorklists.pr.openFileDiff",
      title: "Open PR File Diff",
      arguments: [el.path],
    };
    item.contextValue = "gitWorklists.prFile";
    return item;
  }

  getChildren(el?: PrDetailsNode): Thenable<PrDetailsNode[]> {
    if (!el) {
      return Promise.resolve([{ kind: "root" }]);
    }

    if (el.kind === "root") {
      if (!this.details) {
        return Promise.resolve([{ kind: "empty" }]);
      }
      return Promise.resolve([
        {
          kind: "meta",
          label: `#${this.details.number} ${this.details.title}`,
        },
        { kind: "meta", label: `Base: ${this.details.baseRefName ?? "main"}` },
        { kind: "filesRoot" },
      ]);
    }

    if (el.kind === "filesRoot") {
      const files = this.details?.files ?? [];
      return Promise.resolve(
        files.map((f) => ({ kind: "file", path: f.path })),
      );
    }

    return Promise.resolve([]);
  }
}
