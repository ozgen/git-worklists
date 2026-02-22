import * as vscode from "vscode";

export type RepoWatchers = {
  dispose(): void;
};

export function createRepoWatchers(opts: {
  repoRoot: string;
  gitDir: string;
  triggerRefresh: () => void; 
  debounceMs?: number; 
}): RepoWatchers {
  const repoRootUri = vscode.Uri.file(opts.repoRoot);
  const gitDirUri = vscode.Uri.file(opts.gitDir);

  const debounceMs = opts.debounceMs ?? 800;
  let timer: NodeJS.Timeout | undefined;
  let pending = false;

  const schedule = () => {
    pending = true;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      if (!pending) {
        return;
      }
      pending = false;
      opts.triggerRefresh();
    }, debounceMs);
  };

  const norm = (p: string) => p.replace(/\\/g, "/");

  // Keep this list small and practical.
  const shouldIgnoreWorktree = (uri: vscode.Uri) => {
    const p = norm(uri.fsPath);

    // ignore outside repo (paranoia)
    if (!norm(p).startsWith(norm(opts.repoRoot))) {
      return true;
    }

    return (
      p.includes("/.git/") ||
      p.includes("/node_modules/") ||
      p.includes("/dist/") ||
      p.includes("/build/") ||
      p.includes("/.next/") ||
      p.includes("/target/") ||
      p.includes("/out/") ||
      p.includes("/coverage/") ||
      p.includes("/.turbo/") ||
      p.includes("/.cache/") ||
      p.endsWith(".tmp") ||
      p.endsWith(".swp")
    );
  };

  // Working tree watcher (terminal formatter edits files)
  const worktreeWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(repoRootUri.fsPath, "**/*"),
  );

  const onWorktree = (uri: vscode.Uri) => {
    if (shouldIgnoreWorktree(uri)) {
      return;
    }
    schedule();
  };

  worktreeWatcher.onDidCreate(onWorktree);
  worktreeWatcher.onDidChange(onWorktree);
  worktreeWatcher.onDidDelete(onWorktree);

  //   Git dir watcher (terminal git commands change index/refs/HEAD)
  // - index changes: stage/unstage
  // - HEAD/refs change: checkout, commit, branch switch
  // - packed-refs change: sometimes refs are packed
  // - rebase/merge/cherry-pick state changes: useful for UI updates
  const gitWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      gitDirUri.fsPath,
      "{" +
        "index," +
        "HEAD," +
        "packed-refs," +
        "refs/**," +
        "rebase-apply/**," +
        "rebase-merge/**," +
        "MERGE_HEAD," +
        "CHERRY_PICK_HEAD," +
        "REVERT_HEAD" +
        "}",
    ),
  );

  gitWatcher.onDidCreate(schedule);
  gitWatcher.onDidChange(schedule);
  gitWatcher.onDidDelete(schedule);

  return {
    dispose() {
      if (timer) {
        clearTimeout(timer);
      }
      worktreeWatcher.dispose();
      gitWatcher.dispose();
    },
  };
}
