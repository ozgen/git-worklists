import * as path from "path";
import * as vscode from "vscode";
import type { BookmarkEntry, BookmarkSlot } from "../../core/bookmark/bookmark";
import type { WorkspaceStateStore } from "../../adapters/storage/workspaceStateStore";
import { normalizeRepoRelPath } from "../../utils/paths";

export class BookmarkDecorationProvider implements vscode.Disposable {
  private repoRoot = "";
  private readonly decorations = new Map<
    BookmarkSlot,
    vscode.TextEditorDecorationType
  >();

  constructor(
    private readonly store: WorkspaceStateStore,
    private readonly context: vscode.ExtensionContext,
  ) {}

  setRepoRoot(repoRoot: string): void {
    this.repoRoot = repoRoot;
  }

  async refreshVisibleEditors(): Promise<void> {
    await Promise.all(
      vscode.window.visibleTextEditors.map((editor) =>
        this.refreshEditor(editor),
      ),
    );
  }

  async refreshActiveEditor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    await this.refreshEditor(editor);
  }

  clearAllEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      for (const deco of this.decorations.values()) {
        editor.setDecorations(deco, []);
      }
    }
  }

  dispose(): void {
    for (const deco of this.decorations.values()) {
      deco.dispose();
    }
    this.decorations.clear();
  }

  private async refreshEditor(editor: vscode.TextEditor): Promise<void> {
    for (const deco of this.decorations.values()) {
      editor.setDecorations(deco, []);
    }

    if (!this.repoRoot) {
      return;
    }

    if (editor.document.uri.scheme !== "file") {
      return;
    }

    const filePath = path.resolve(editor.document.uri.fsPath);
    const repoRoot = path.resolve(this.repoRoot);

    const rel = path.relative(repoRoot, filePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return;
    }

    const repoRelativePath = normalizeRepoRelPath(rel);
    const bookmarks = await this.store.getAll(this.repoRoot);

    const matching = bookmarks.filter(
      (entry) =>
        normalizeRepoRelPath(entry.target.repoRelativePath) === repoRelativePath,
    );

    if (matching.length === 0) {
      return;
    }

    for (const entry of matching) {
      const line = this.clampLine(editor.document, entry.target.line);
      const range = new vscode.Range(line, 0, line, 0);
      const decoration = this.getDecoration(entry.slot);

      editor.setDecorations(decoration, [
        {
          range,
          hoverMessage: `Bookmark ${entry.slot}`,
        },
      ]);
    }
  }

  private clampLine(document: vscode.TextDocument, line: number): number {
    if (document.lineCount <= 0) {
      return 0;
    }

    if (line < 0) {
      return 0;
    }

    if (line >= document.lineCount) {
      return document.lineCount - 1;
    }

    return line;
  }

  private getDecoration(slot: BookmarkSlot): vscode.TextEditorDecorationType {
    const existing = this.decorations.get(slot);
    if (existing) {
      return existing;
    }

    const iconFile = vscode.Uri.joinPath(
      this.context.extensionUri,
      "media",
      "bookmarks",
      `bookmark-${slot}.svg`,
    );

    const created = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        gutterIconPath: iconFile,
        gutterIconSize: "contain",
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        light: {
          backgroundColor: "rgba(215, 186, 125, 0.08)",
        },
        dark: {
          backgroundColor: "rgba(215, 186, 125, 0.08)",
        },
      });

    this.decorations.set(slot, created);
    return created;
  }
}