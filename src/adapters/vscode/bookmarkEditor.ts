import * as path from "path";
import * as vscode from "vscode";
import type { BookmarkTarget } from "../../core/bookmark/bookmark";

export class VsCodeBookmarkEditor {
  getActiveEditorTarget(repoRoot: string): BookmarkTarget | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    if (editor.document.isUntitled) {
      return undefined;
    }

    const filePath = editor.document.uri.fsPath;
    const normalizedRepoRoot = path.resolve(repoRoot);
    const normalizedFilePath = path.resolve(filePath);

    if (!this.isInsideRepo(normalizedRepoRoot, normalizedFilePath)) {
      return undefined;
    }

    const repoRelativePath = path.relative(normalizedRepoRoot, normalizedFilePath);
    const pos = editor.selection.active;

    return {
      repoRelativePath,
      line: pos.line,
      column: pos.character,
    };
  }

  async openTarget(repoRoot: string, target: BookmarkTarget): Promise<void> {
    const absolutePath = path.join(repoRoot, target.repoRelativePath);
    const uri = vscode.Uri.file(absolutePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });

    const position = new vscode.Position(target.line, target.column);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position));
  }

  getTargetFromFsPath(
    repoRoot: string,
    absoluteFilePath: string,
    line = 0,
    column = 0,
  ): BookmarkTarget | undefined {
    const normalizedRepoRoot = path.resolve(repoRoot);
    const normalizedFilePath = path.resolve(absoluteFilePath);

    if (!this.isInsideRepo(normalizedRepoRoot, normalizedFilePath)) {
      return undefined;
    }

    return {
      repoRelativePath: path.relative(normalizedRepoRoot, normalizedFilePath),
      line,
      column,
    };
  }

  private isInsideRepo(repoRoot: string, filePath: string): boolean {
    const rel = path.relative(repoRoot, filePath);
    return !rel.startsWith("..") && !path.isAbsolute(rel);
  }
}