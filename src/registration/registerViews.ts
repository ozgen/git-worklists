import * as vscode from "vscode";

import { GitShowContentProvider } from "../adapters/vscode/gitShowContentProvider";
import { Deps } from "../app/types";

export function registerViews(context: vscode.ExtensionContext, deps: Deps) {
  context.subscriptions.push(deps.treeView);

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(deps.deco),
  );

  const showProvider = new GitShowContentProvider(deps.git, deps.repoRoot);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      GitShowContentProvider.scheme,
      showProvider,
    ),
  );
}
