import * as vscode from "vscode";
import { PullRequest } from "../../core/pr/model/pullRequest";

export type PrNode = { kind: "root" } | { kind: "pr"; pr: PullRequest };

export class PrTreeProvider implements vscode.TreeDataProvider<PrNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private prs: PullRequest[] = [];

  setPullRequests(prs: PullRequest[]) {
    this.prs = prs;
    this._onDidChangeTreeData.fire();
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PrNode): vscode.TreeItem {
    if (element.kind === "root") {
      const item = new vscode.TreeItem(
        "Open Pull Requests",
        vscode.TreeItemCollapsibleState.Expanded,
      );
      return item;
    }

    const pr = element.pr;
    const item = new vscode.TreeItem(
      `#${pr.number} ${pr.title}`,
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = pr.authorLogin ? `@${pr.authorLogin}` : undefined;

    item.command = {
      command: "gitWorklists.pr.select",
      title: "Select PR",
      arguments: [pr.number],
    };

    item.contextValue = "gitWorklists.prItem";
    return item;
  }

  getChildren(element?: PrNode): Thenable<PrNode[]> {
    if (!element) {
      return Promise.resolve([{ kind: "root" }]);
    }
    if (element.kind === "root") {
      return Promise.resolve(this.prs.map((pr) => ({ kind: "pr", pr })));
    }
    return Promise.resolve([]);
  }
}
