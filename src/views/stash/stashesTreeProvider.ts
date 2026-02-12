import * as vscode from "vscode";
import { GitClient } from "../../adapters/git/gitClient";
import { ListStashes } from "../../usecases/stash/listStashes";
import { StashNode, toTreeItem } from "./stashNodes";

export class StashesTreeProvider
  implements vscode.TreeDataProvider<StashNode>, vscode.Disposable
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    StashNode | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private disposed = false;

  constructor(
    private readonly repoRootFsPath: string,
    private readonly git: GitClient,
  ) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: StashNode): vscode.TreeItem {
    return toTreeItem(element);
  }

  async getChildren(element?: StashNode): Promise<StashNode[]> {
    if (this.disposed) {
      return [];
    }

    if (!element) {
      return [{ kind: "root" }];
    }
    if (element.kind === "root") {
      const uc = new ListStashes(this.git);
      const stashes = await uc.run(this.repoRootFsPath);
      return stashes.map((s) => ({ kind: "stash", stash: s }));
    }
    return [];
  }

  dispose(): void {
    this.disposed = true;
    this.onDidChangeTreeDataEmitter.dispose();
  }
}
