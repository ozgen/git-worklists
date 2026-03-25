import * as vscode from "vscode";
import type { Deps } from "../app/types";

export function registerBookmarkDecorations(deps: Deps): void {
  const { context } = deps;

  context.subscriptions.push(deps.bookmarkDeco);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async () => {
      await deps.bookmarkDeco.refreshVisibleEditors();
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(async () => {
      await deps.bookmarkDeco.refreshVisibleEditors();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const active = vscode.window.activeTextEditor;
      if (!active) {
        return;
      }

      if (event.document.uri.toString() !== active.document.uri.toString()) {
        return;
      }

      await deps.bookmarkDeco.refreshActiveEditor();
    }),
  );

  context.subscriptions.push(
    deps.onDidChangeRepoRoot(async (repoRoot) => {
      deps.bookmarkDeco.setRepoRoot(repoRoot);
      await deps.bookmarkDeco.refreshVisibleEditors();
    }),
  );

  // important: initial paint
  void deps.bookmarkDeco.refreshVisibleEditors();
}