export type GitStatusEntry = {
  /** repo-relative path */
  path: string;
  /** first status char in porcelain (index status) */
  x: string;
  /** second status char in porcelain (worktree status) */
  y: string;
};

export interface GitClient {
  /** returns repo root absolute path */
  getRepoRoot(workspaceFsPath: string): Promise<string>;

  /** returns status entries from `git status --porcelain=v1 -z` */
  getStatusPorcelainZ(repoRootFsPath: string): Promise<GitStatusEntry[]>;

  add(repoRootFsPath: string, repoRelativePath: string): Promise<void>;

  getGitDir(repoRootFsPath: string): Promise<string>;
}
