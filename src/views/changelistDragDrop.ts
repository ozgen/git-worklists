import * as vscode from "vscode";
import { FileNode, GroupNode } from "./changelistTreeProvider";
import { MoveFilesToChangelist } from "../usecases/moveFilesToChangelist";
import { normalizeRepoRelPath } from "../utils/paths";

type TreeNode = GroupNode | FileNode;

const MIME = "application/vnd.git-worklists.nodes";

type DragPayload = { kind: "file"; path: string } | { kind: "group"; listId: string; files: string[] };

export class ChangelistDragDrop implements vscode.TreeDragAndDropController<TreeNode> {
  readonly dragMimeTypes = [MIME];
  readonly dropMimeTypes = [MIME];

  constructor(
    private readonly moveFiles: MoveFilesToChangelist,
    private readonly getRepoRoot: () => string,
    private readonly onDrop: () => Promise<void>,
  ) {}

  handleDrag(
    source: readonly TreeNode[],
    dataTransfer: vscode.DataTransfer,
  ): void {
    const payloads: DragPayload[] = [];

    for (const node of source) {
      if (node instanceof FileNode) {
        payloads.push({ kind: "file", path: node.repoRelativePath });
      } else if (node instanceof GroupNode) {
        payloads.push({ kind: "group", listId: node.list.id, files: node.list.files });
      }
    }

    dataTransfer.set(MIME, new vscode.DataTransferItem(JSON.stringify(payloads)));
  }

  async handleDrop(
    target: TreeNode | undefined,
    dataTransfer: vscode.DataTransfer,
  ): Promise<void> {
    if (!(target instanceof GroupNode)) {
      return;
    }

    const item = dataTransfer.get(MIME);
    if (!item) {
      return;
    }

    const payloads: DragPayload[] = JSON.parse(await item.asString());
    const targetId = target.list.id;

    const filesToMove: string[] = [];
    for (const p of payloads) {
      if (p.kind === "file") {
        filesToMove.push(normalizeRepoRelPath(p.path));
      } else if (p.kind === "group" && p.listId !== targetId) {
        filesToMove.push(...p.files.map(normalizeRepoRelPath));
      }
    }

    if (filesToMove.length === 0) {
      return;
    }

    await this.moveFiles.run(this.getRepoRoot(), filesToMove, targetId);
    await this.onDrop();
  }
}
