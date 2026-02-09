import * as vscode from "vscode";
import { WorkspaceStateStore } from "../adapters/storage/WorkspaceStateStore";
import { SystemChangelist } from "../core/changelist/SystemChangelist";

type PersistedChangelist = {
  id: string;
  name: string;
  files: string[];
};

abstract class Node extends vscode.TreeItem {
  abstract readonly kind: "group" | "file";
}

class GroupNode extends Node {
  readonly kind = "group" as const;

  constructor(
    public readonly list: PersistedChangelist,
    public readonly title: string,
    public readonly icon: vscode.ThemeIcon,
  ) {
    super(title, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "gitWorklists.group";
    this.iconPath = icon;
  }
}

class FileNode extends Node {
  readonly kind = "file" as const;

  constructor(
    public readonly repoRoot: vscode.Uri,
    public readonly repoRelativePath: string,
  ) {
    super(repoRelativePath, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "gitWorklists.file";
    this.iconPath = vscode.ThemeIcon.File;

    const abs = vscode.Uri.joinPath(repoRoot, repoRelativePath);
    this.resourceUri = abs;

    // show folder on the right (like Source Control)
    const parts = repoRelativePath.split("/");
    if (parts.length > 1) {
      this.description = parts.slice(0, -1).join("/");
    }

    this.command = {
      command: "vscode.open",
      title: "Open",
      arguments: [abs],
    };
  }
}

export class ChangelistTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private repoRootFsPath?: string;

  constructor(private readonly store: WorkspaceStateStore) {}

  setRepoRoot(repoRootFsPath: string) {
    this.repoRootFsPath = repoRootFsPath;
    this.refresh();
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (!this.repoRootFsPath) return [];

    const state = await this.store.load(this.repoRootFsPath);
    if (!state) return [];

    const lists = state.lists as PersistedChangelist[];

    const unversioned =
      lists.find((l) => l.id === SystemChangelist.Unversioned) ??
      ({
        id: SystemChangelist.Unversioned,
        name: "Unversioned",
        files: [],
      } as PersistedChangelist);

    const def =
      lists.find((l) => l.id === SystemChangelist.Default) ??
      ({
        id: SystemChangelist.Default,
        name: "Default",
        files: [],
      } as PersistedChangelist);

    // Root level: match the screenshot-style groups
    if (!element) {
      const changesTitle = `Changes (${def.files.length})`;
      const unvTitle = `Unversioned Files (${unversioned.files.length})`;

      return [
        new GroupNode(def, changesTitle, new vscode.ThemeIcon("diff")),
        new GroupNode(
          unversioned,
          unvTitle,
          new vscode.ThemeIcon("circle-slash"),
        ),
      ];
    }

    // Children: list files
    if (element instanceof GroupNode) {
      const repoRoot = vscode.Uri.file(this.repoRootFsPath);
      const files = [...element.list.files].sort((a, b) => a.localeCompare(b));
      return files.map((p) => new FileNode(repoRoot, p));
    }

    return [];
  }
}
