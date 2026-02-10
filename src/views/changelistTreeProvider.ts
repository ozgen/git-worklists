import * as vscode from "vscode";
import { WorkspaceStateStore } from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";

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
    public readonly stageState: GroupStageState,
  ) {
    const title = groupTitle(list);
    super(title, vscode.TreeItemCollapsibleState.Expanded);

    this.contextValue =
      list.id === SystemChangelist.Default ||
      list.id === SystemChangelist.Unversioned
        ? "gitWorklists.group.system"
        : "gitWorklists.group.custom";
    this.iconPath = new vscode.ThemeIcon(groupIcon(stageState));

    // Click toggles staging for all files in group
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
    repoRoot: vscode.Uri,
    public readonly repoRelativePath: string,
    public readonly isStaged: boolean,
  ) {
    super(repoRelativePath, vscode.TreeItemCollapsibleState.None);

    this.contextValue = "gitWorklists.file";

    const abs = vscode.Uri.joinPath(repoRoot, repoRelativePath);
    this.resourceUri = abs;

    this.iconPath = new vscode.ThemeIcon(isStaged ? "check" : "square");

    // show folder on the right (like Source Control)
    const parts = repoRelativePath.split("/");
    if (parts.length > 1) {
      this.description = parts.slice(0, -1).join("/");
    }

    // Click toggles staged state (NOT open)
    this.command = {
      command: isStaged ? "gitWorklists.unstagePath" : "gitWorklists.stagePath",
      title: isStaged ? "Unstage" : "Stage",
      arguments: [abs],
    };
  }
}

export class ChangelistTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private repoRootFsPath?: string;
  private stagedPaths = new Set<string>(); // repo-relative, normalized

  constructor(private readonly store: WorkspaceStateStore) {}

  setRepoRoot(repoRootFsPath: string) {
    this.repoRootFsPath = repoRootFsPath;
    this.refresh();
  }

  setStagedPaths(staged: Set<string>) {
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
    if (!state || state.version !== 1) {
      return [];
    }

    const lists = state.lists as PersistedChangelist[];

    // Root level: show system lists first, then all custom lists
    if (!element) {
      const systemIds = new Set<string>([
        SystemChangelist.Default,
        SystemChangelist.Unversioned,
      ]);

      const byId = new Map(lists.map((l) => [l.id, l] as const));

      const result: GroupNode[] = [];

      // System lists first (stable order)
      const def = byId.get(SystemChangelist.Default);
      if (def) {
        result.push(
          new GroupNode(def, groupStageState(this.stagedPaths, def.files)),
        );
      }

      const unv = byId.get(SystemChangelist.Unversioned);
      if (unv) {
        result.push(
          new GroupNode(unv, groupStageState(this.stagedPaths, unv.files)),
        );
      }

      // Then custom lists
      const custom = lists
        .filter((l) => !systemIds.has(l.id))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const l of custom) {
        result.push(
          new GroupNode(l, groupStageState(this.stagedPaths, l.files)),
        );
      }

      return result;
    }

    // Group -> file children
    if (element instanceof GroupNode) {
      const repoRoot = vscode.Uri.file(this.repoRootFsPath);
      const files = [...element.list.files].sort((a, b) => a.localeCompare(b));

      return files.map((p) => {
        const norm = normalizeRepoRelPath(p);
        const staged = this.stagedPaths.has(norm);
        return new FileNode(repoRoot, norm, staged);
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

function groupTitle(list: PersistedChangelist): string {
  if (list.id === SystemChangelist.Default) {
    return `Changes (${list.files.length})`;
  }
  if (list.id === SystemChangelist.Unversioned) {
    return `Unversioned Files (${list.files.length})`;
  }
  return `${list.name} (${list.files.length})`;
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
