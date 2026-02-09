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

type GroupStageState = "all" | "none" | "mixed";

class GroupNode extends Node {
  readonly kind = "group" as const;

  constructor(
    public readonly list: PersistedChangelist,
    public readonly title: string,
    public readonly stageState: GroupStageState,
  ) {
    super(title, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "gitWorklists.group";

    // checkbox-like icon
    this.iconPath = new vscode.ThemeIcon(groupIcon(stageState));

    // Clicking group toggles staging for all files in group
    this.command = {
      command: "gitWorklists.toggleGroupSelection",
      title: "Toggle Group Staging",
      arguments: [this],
    };
  }
}

class FileNode extends Node {
  readonly kind = "file" as const;

  constructor(
    public readonly repoRoot: vscode.Uri,
    public readonly repoRelativePath: string,
    public readonly isStaged: boolean,
  ) {
    super(repoRelativePath, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "gitWorklists.file";

    const abs = vscode.Uri.joinPath(repoRoot, repoRelativePath);
    this.resourceUri = abs;

    // checkbox-like icon
    this.iconPath = new vscode.ThemeIcon(isStaged ? "check" : "square");

    // show folder on the right (like Source Control)
    const parts = repoRelativePath.split("/");
    if (parts.length > 1) {
      this.description = parts.slice(0, -1).join("/");
    }

    // Clicking the file toggles staged state (NOT open)
    this.command = {
      command: isStaged ? "gitWorklists.unstagePath" : "gitWorklists.stagePath",
      title: isStaged ? "Unstage" : "Stage",
      arguments: [abs], // use Uri so command can compute repo-relative path safely
    };
  }
}

export class ChangelistTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private repoRootFsPath?: string;

  // staged paths are injected from extension.ts during refresh
  private stagedPaths = new Set<string>();

  constructor(private readonly store: WorkspaceStateStore) {}

  setRepoRoot(repoRootFsPath: string) {
    this.repoRootFsPath = repoRootFsPath;
    this.refresh();
  }

  setStagedPaths(staged: Set<string>) {
    // normalize once so lookups match your persisted paths
    this.stagedPaths = new Set(Array.from(staged).map(normalizeRepoRelPath));
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (!this.repoRootFsPath) {
      return [];
    }

    const state = await this.store.load(this.repoRootFsPath);
    if (!state) {
      return [];
    }

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

    // Root level groups
    if (!element) {
      const changesTitle = `Changes (${def.files.length})`;
      const unvTitle = `Unversioned Files (${unversioned.files.length})`;

      const defState = groupStageState(this.stagedPaths, def.files);
      const unvState = groupStageState(this.stagedPaths, unversioned.files);

      return [
        new GroupNode(def, changesTitle, defState),
        new GroupNode(unversioned, unvTitle, unvState),
      ];
    }

    // Group -> file children
    if (element instanceof GroupNode) {
      const repoRoot = vscode.Uri.file(this.repoRootFsPath);
      const files = [...element.list.files].sort((a, b) => a.localeCompare(b));

      return files.map((p) => {
        const norm = normalizeRepoRelPath(p);
        const staged = this.stagedPaths.has(norm);
        return new FileNode(repoRoot, p, staged);
      });
    }

    return [];
  }
}

function normalizeRepoRelPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function groupStageState(
  staged: Set<string>,
  files: string[],
): GroupStageState {
  if (files.length === 0) {
    return "none";
  }

  let count = 0;
  for (const f of files) {
    if (staged.has(normalizeRepoRelPath(f))) {
      count++;
    }
  }

  if (count === 0) {
    return "none";
  }
  if (count === files.length) {
    return "all";
  }
  return "mixed";
}

function groupIcon(state: GroupStageState): string {
  switch (state) {
    case "all":
      return "check";
    case "none":
      return "square";
    case "mixed":
      return "remove";
  }
}
