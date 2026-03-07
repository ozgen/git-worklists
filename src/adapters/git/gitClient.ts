import { normalizeRepoRelPath } from "../../utils/paths";

export type GitStatusEntry = {
  /** repo-relative path */
  path: string;
  /** first status char in porcelain (index status) */
  x: string;
  /** second status char in porcelain (worktree status) */
  y: string;
  /** previous path before a rename or copy */
  oldPath?: string;
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
  changelistName?: string;
};

export type OutgoingCommit = {
  hash: string;
  shortHash: string;
  subject: string;
  authorName?: string;
  authorDateIso?: string;
};

export type CommitFileChange = {
  /** repo-relative path (new path if renamed) */
  path: string;
  /** status code from `--name-status` */
  status: "A" | "M" | "D" | "R" | "C" | "T" | "U" | "?";
  /** for renames/copies */
  oldPath?: string;
};

export type StashFileEntry = {
  /** repo-relative path (new path if renamed) */
  path: string;
  /** best effort status */
  status: "A" | "M" | "D" | "R" | "C" | "T" | "U" | "?";
  /** old path for rename/copy */
  oldPath?: string;
};

/** Pure helper — returns the subset of `files` that appear in `staged`. */
export function getStagedFilesInGroup(
  files: string[],
  staged: Set<string>,
): string[] {
  return files.map(normalizeRepoRelPath).filter((p) => staged.has(p));
}

export type FileStageState = "none" | "partial" | "all";

export interface GitClient {
  /** returns repo root absolute path */
  getRepoRoot(workspaceFsPath: string): Promise<string>;

  tryGetRepoRoot(workspaceFsPath: string): Promise<string | null>;

  /** returns status entries from `git status --porcelain=v1 -z` */
  getStatusPorcelainZ(repoRootFsPath: string): Promise<GitStatusEntry[]>;

  getGitDir(repoRootFsPath: string): Promise<string>;

  isIgnored(repoRootFsPath: string, repoRelativePath: string): Promise<boolean>;

  // ---- Staging ----

  add(repoRootFsPath: string, repoRelativePath: string): Promise<void>;

  stageMany(repoRootFsPath: string, repoRelativePaths: string[]): Promise<void>;

  unstageMany(
    repoRootFsPath: string,
    repoRelativePaths: string[],
  ): Promise<void>;

  /**
   * Returns staged paths as a normalized Set<string>.
   * Derived from `git status --porcelain=v1 -z`.
   */
  getStagedPaths(repoRootFsPath: string): Promise<Set<string>>;

  /**
   * Returns per-file stage state derived from `git status --porcelain=v1 -z`.
   * Only files with at least one staged change appear in the map.
   */
  getFileStageStates(
    repoRootFsPath: string,
  ): Promise<Map<string, FileStageState>>;

  /** Returns raw output of `git diff -- <repoRelPath>` (unstaged changes: index → worktree). */
  getDiffUnstaged(
    repoRootFsPath: string,
    repoRelPath: string,
  ): Promise<string>;

  /** Applies a unified diff patch to the git index via `git apply --cached`. */
  applyPatchStaged(repoRootFsPath: string, patch: string): Promise<void>;

  /** Returns repo-relative paths of untracked files (`git ls-files --others`). */
  getUntrackedPaths(repoRootFsPath: string): Promise<string[]>;

  // ---- Refs ----

  /** Returns true when the file has no entry in HEAD (i.e. newly added). */
  isNewFileInRepo(
    repoRootFsPath: string,
    repoRelativePath: string,
  ): Promise<boolean>;

  /** Returns true when `git cat-file -e <ref>:<path>` succeeds. */
  fileExistsAtRef(
    repoRootFsPath: string,
    ref: string,
    repoRelativePath: string,
  ): Promise<boolean>;

  // ---- Diff ----

  /**
   * Returns file content as it exists at a git ref (e.g. HEAD, HEAD^, : for index).
   * Throws if the path does not exist at that ref.
   */
  showFileAtRef(
    repoRootFsPath: string,
    ref: string,
    repoRelativePath: string,
  ): Promise<string>;

  /**
   * Like showFileAtRef, but returns undefined when the ref/path does not exist.
   * Used for diffs of added files, first commits, and renames.
   */
  showFileAtRefOptional(
    repoRootFsPath: string,
    ref: string,
    repoRelativePath: string,
  ): Promise<string | undefined>;

  // ---- HEAD ----

  /** Returns the trimmed message of the most recent commit. */
  getHeadMessage(repoRootFsPath: string): Promise<string>;

  /**
   * Returns true when HEAD has a parent and the diff vs that parent is empty
   * (i.e. the last commit introduced no changes).
   */
  isHeadEmptyVsParent(repoRootFsPath: string): Promise<boolean>;

  // ---- Commits ----

  /** e.g. "origin/main" — throws if no upstream configured */
  getUpstreamRef(repoRootFsPath: string): Promise<string>;

  tryGetUpstreamRef(repoRootFsPath: string): Promise<string | undefined>;

  /** commits that would be pushed: upstream..HEAD */
  listOutgoingCommits(repoRootFsPath: string): Promise<OutgoingCommit[]>;

  getCommitFiles(
    repoRootFsPath: string,
    commitHash: string,
  ): Promise<CommitFileChange[]>;

  /**
   * Runs `git commit <args>`. Pass args WITHOUT the "commit" verb.
   * e.g. commit(root, ["-m", "msg"]) => git commit -m "msg"
   */
  commit(repoRootFsPath: string, args: string[]): Promise<void>;

  // ---- Push ----

  /**
   * Pushes the current branch. Falls back to `push -u origin <branch>` when
   * no upstream is configured. Uses `--force-with-lease` when amend=true.
   */
  push(repoRootFsPath: string, opts: { amend: boolean }): Promise<void>;

  // ---- Discard ----

  /**
   * Discards both staged and working-tree changes for the given paths.
   * Runs `git restore --staged --worktree -- <paths>`.
   */
  discardFiles(
    repoRootFsPath: string,
    repoRelativePaths: string[],
  ): Promise<void>;

  // ---- Stash ----

  /** `git stash list` */
  stashList(repoRootFsPath: string): Promise<GitStashEntry[]>;

  /**
   * Stash only the provided repo-relative paths.
   * Pass `includeUntracked: true` to also stash new (untracked) files among those paths.
   */
  stashPushPaths(
    repoRootFsPath: string,
    message: string,
    repoRelativePaths: string[],
    opts?: { includeUntracked?: boolean },
  ): Promise<void>;

  /** `git stash apply <ref>` */
  stashApply(repoRootFsPath: string, ref: string): Promise<void>;

  /** `git stash pop <ref>` */
  stashPop(repoRootFsPath: string, ref: string): Promise<void>;

  /** `git stash drop <ref>` */
  stashDrop(repoRootFsPath: string, ref: string): Promise<void>;

  /**
   * Files affected by a stash.
   * Uses name-status so we can show A/M/D and handle renames.
   */
  stashListFiles(
    repoRootFsPath: string,
    stashRef: string,
  ): Promise<StashFileEntry[]>;
}
