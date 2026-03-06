import * as path from "path";
import * as vscode from "vscode";
import { GitCliClient } from "../git/gitCliClient";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "target",
  "out",
  "coverage",
  ".turbo",
  ".cache",
]);

async function collectDirectories(
  dir: vscode.Uri,
  result: string[],
  maxDepth: number,
  currentDepth = 0,
): Promise<void> {
  if (currentDepth > maxDepth) {
    return;
  }

  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(dir);
  } catch {
    return;
  }

  for (const [name, type] of entries) {
    if (type !== vscode.FileType.Directory) {
      continue;
    }

    if (SKIP_DIRS.has(name)) {
      continue;
    }

    const child = vscode.Uri.joinPath(dir, name);
    result.push(child.fsPath);

    await collectDirectories(child, result, maxDepth, currentDepth + 1);
  }
}

export async function findWorkspaceRepoRoots(
  workspaceFolder: vscode.WorkspaceFolder,
  git: GitCliClient,
): Promise<string[]> {
  const roots = new Set<string>();

  // First, try the workspace folder itself.
  try {
    roots.add(await git.getRepoRoot(workspaceFolder.uri.fsPath));
  } catch {
    // ignore
  }

  // Then scan subdirectories and ask Git for each candidate.
  const candidateDirs: string[] = [];
  await collectDirectories(workspaceFolder.uri, candidateDirs, 4);

  for (const dir of candidateDirs) {
    try {
      const repoRoot = await git.getRepoRoot(dir);
      roots.add(path.normalize(repoRoot));
    } catch {
      // not a repo, ignore
    }
  }

  return [...roots].sort((a, b) => a.localeCompare(b));
}
