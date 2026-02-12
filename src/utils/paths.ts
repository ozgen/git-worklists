import * as vscode from "vscode";
import { GitRefContentProvider } from "../views/pr/gitRefContentProvider";

export function normalizeRepoRelPath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function toRepoRelPath(repoRoot: string, uri: vscode.Uri): string {
  const root = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const full = uri.fsPath.replace(/\\/g, "/");
  if (full === root) {
    return "";
  }
  if (!full.startsWith(root + "/")) {
    return "";
  }
  return full.slice(root.length + 1);
}

export function getRepoRelPathForEditor(
  repoRoot: string,
  uri: vscode.Uri,
): string {
  if (uri.scheme === "file") {
    return toRepoRelPath(repoRoot, uri);
  }

  if (uri.scheme === GitRefContentProvider.scheme) {
    return uri.path.replace(/^\/+/, "");
  }

  return "";
}
