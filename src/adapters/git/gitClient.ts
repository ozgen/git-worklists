export type GitStatusEntry = {
  /** repo-relative path */
  path: string;
  /** first status char in porcelain (index status) */
  x: string;
  /** second status char in porcelain (worktree status) */
  y: string;
};

export type GitStashEntry = {
  /** e.g. "stash@{0}" */
  ref: string;
  /** full label after the ref */
  message: string;
  /** original line from `git stash list` */
  raw: string;

  /** best-effort parsing */
  isGitWorklists?: boolean;
  changelistId?: string;
};

export interface GitClient {
  /** returns repo root absolute path */
  getRepoRoot(workspaceFsPath: string): Promise<string>;

  /** returns status entries from `git status --porcelain=v1 -z` */
  getStatusPorcelainZ(repoRootFsPath: string): Promise<GitStatusEntry[]>;

  add(repoRootFsPath: string, repoRelativePath: string): Promise<void>;

  getGitDir(repoRootFsPath: string): Promise<string>;

  tryGetRepoRoot(workspaceFsPath: string): Promise<string | null>;

  add(repoRootFsPath: string, repoRelativePath: string): Promise<void>;

  addMany?(repoRootFsPath: string, repoRelativePaths: string[]): Promise<void>;

  isIgnored(repoRootFsPath: string, repoRelativePath: string): Promise<boolean>;

  // ---- Stash (new) ----

  /** `git stash list` */
  stashList(repoRootFsPath: string): Promise<GitStashEntry[]>;

  /**
   * Stash only the provided repo-relative paths.
   * Uses: `git stash push -m <message> -- <paths...>`
   */
  stashPushPaths(
    repoRootFsPath: string,
    message: string,
    repoRelativePaths: string[],
  ): Promise<void>;

  /** `git stash apply <ref>` */
  stashApply(repoRootFsPath: string, ref: string): Promise<void>;

  /** `git stash pop <ref>` */
  stashPop(repoRootFsPath: string, ref: string): Promise<void>;

  /** `git stash drop <ref>` */
  stashDrop(repoRootFsPath: string, ref: string): Promise<void>;
}
