import * as vscode from "vscode";

export function normalizeRepoRelPath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function normalizeFsPathForComparison(p: string): string {
  const normalized = normalizeRepoRelPath(p);
  return process.platform === "win32"
    ? normalized.replace(/^[A-Z]:/, (drive) => drive.toLowerCase())
    : normalized;
}

export function toRepoRelPath(repoRoot: string, uri: vscode.Uri): string {
  const root = normalizeFsPathForComparison(repoRoot).replace(/\/+$/, "");
  const full = normalizeRepoRelPath(uri.fsPath);
  const comparableFull = normalizeFsPathForComparison(full);
  if (comparableFull === root) {
    return "";
  }
  if (!comparableFull.startsWith(root + "/")) {
    return "";
  }
  return full.slice(root.length + 1);
}

