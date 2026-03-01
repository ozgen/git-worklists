import * as cp from "child_process";
import * as path from "path";
import {
  CommitFileChange,
  GitClient,
  GitStashEntry,
  GitStatusEntry,
  OutgoingCommit,
  StashFileEntry,
} from "./gitClient";
import { normalizeRepoRelPath } from "../../utils/paths";

const GIT_TIMEOUT_MS = 10_000;

const VALID_STATUS_CODES = new Set(["A", "M", "D", "R", "C", "T", "U", "?"]);

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = cp.execFile(
      "git",
      args,
      {
        cwd,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024, // 50MB
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(`git ${args.join(" ")} failed: ${stderr || err.message}`),
          );
          return;
        }
        resolve(stdout);
      },
    );

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`git ${args.join(" ")} timed out after ${GIT_TIMEOUT_MS}ms`));
    }, GIT_TIMEOUT_MS);

    // Clear the timer if the process finishes before timeout
    child.on("close", () => clearTimeout(timer));
  });
}

function looksLikeNoUpstream(err: unknown): boolean {
  const msg = String(err ?? "");
  return (
    msg.includes("no upstream branch") ||
    msg.includes("has no upstream branch") ||
    msg.includes("set the remote as upstream") ||
    (msg.includes("The current branch") && msg.includes("has no upstream"))
  );
}

export function parseStashLine(line: string): GitStashEntry | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const m = trimmed.match(/^(stash@\{\d+\}):\s*(.*)$/);
  if (!m) {
    return { ref: "stash@{?}", message: trimmed, raw: trimmed };
  }

  const ref = m[1];
  const msg = m[2] ?? "";

  // Stash messages are tagged as: "GW:<changelistId> <user message>"
  // Look for "GW:<id>" token anywhere in the message
  const gw = msg.match(/\bGW:([^\s]+)/);

  return {
    ref,
    message: msg,
    raw: trimmed,
    isGitWorklists: !!gw,
    changelistId: gw?.[1],
  };
}

export class GitCliClient implements GitClient {
  async getRepoRoot(workspaceFsPath: string): Promise<string> {
    const out = await execGit(
      ["rev-parse", "--show-toplevel"],
      workspaceFsPath,
    );
    return out.trim();
  }

  async tryGetRepoRoot(workspaceFsPath: string): Promise<string | null> {
    try {
      return await this.getRepoRoot(workspaceFsPath);
    } catch {
      return null;
    }
  }

  async getStatusPorcelainZ(repoRootFsPath: string): Promise<GitStatusEntry[]> {
    const out = await execGit(
      ["status", "--porcelain=v1", "-z"],
      repoRootFsPath,
    );

    const entries: GitStatusEntry[] = [];
    const parts = out.split("\0");
    let i = 0;

    while (i < parts.length) {
      const header = parts[i++];
      if (!header) {
        continue;
      }

      const x = header[0] ?? " ";
      const y = header[1] ?? " ";
      const path1 = header.slice(3);

      if (!path1) {
        continue;
      }

      // Rename/copy: old path then new path
      let finalPath = path1;
      if (x === "R" || x === "C") {
        const path2 = parts[i++] ?? "";
        if (path2) {
          finalPath = path2;
        }
      }

      entries.push({ path: finalPath.trim(), x, y });
    }

    return entries;
  }

  async getGitDir(repoRootFsPath: string): Promise<string> {
    const out = await execGit(["rev-parse", "--git-dir"], repoRootFsPath);
    const p = out.trim();
    return path.isAbsolute(p) ? p : path.join(repoRootFsPath, p);
  }

  async isIgnored(
    repoRootFsPath: string,
    repoRelativePath: string,
  ): Promise<boolean> {
    try {
      // -q => quiet, exit code 0 if ignored, 1 if not
      await execGit(
        ["check-ignore", "-q", "--", repoRelativePath],
        repoRootFsPath,
      );
      return true;
    } catch {
      return false;
    }
  }

  // ---- Staging ----

  async add(repoRootFsPath: string, repoRelativePath: string): Promise<void> {
    await execGit(["add", "--", repoRelativePath], repoRootFsPath);
  }

  async stageMany(
    repoRootFsPath: string,
    repoRelativePaths: string[],
  ): Promise<void> {
    if (repoRelativePaths.length === 0) {
      return;
    }
    await execGit(["add", "--", ...repoRelativePaths], repoRootFsPath);
  }

  async unstageMany(
    repoRootFsPath: string,
    repoRelativePaths: string[],
  ): Promise<void> {
    if (repoRelativePaths.length === 0) {
      return;
    }
    // Use `git restore --staged` (modern equivalent of `git reset`)
    await execGit(
      ["restore", "--staged", "--", ...repoRelativePaths],
      repoRootFsPath,
    );
  }

  async getStagedPaths(repoRootFsPath: string): Promise<Set<string>> {
    const out = await execGit(
      ["status", "--porcelain=v1", "-z"],
      repoRootFsPath,
    );

    const staged = new Set<string>();
    const entries = out.split("\0").filter(Boolean);

    for (const e of entries) {
      const xy = e.slice(0, 2);
      const p = e.slice(3);
      if (!p) {
        continue;
      }
      const x = xy[0]; // index status
      if (x !== " " && x !== "?") {
        staged.add(normalizeRepoRelPath(p));
      }
    }

    return staged;
  }

  async getUntrackedPaths(repoRootFsPath: string): Promise<string[]> {
    const out = await execGit(
      ["ls-files", "--others", "--exclude-standard", "-z"],
      repoRootFsPath,
    );
    return out
      .split("\0")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normalizeRepoRelPath);
  }

  // ---- Refs ----

  async isNewFileInRepo(
    repoRootFsPath: string,
    repoRelativePath: string,
  ): Promise<boolean> {
    try {
      await execGit(
        ["cat-file", "-e", `HEAD:${repoRelativePath}`],
        repoRootFsPath,
      );
      return false;
    } catch {
      return true;
    }
  }

  async fileExistsAtRef(
    repoRootFsPath: string,
    ref: string,
    repoRelativePath: string,
  ): Promise<boolean> {
    try {
      await execGit(
        ["cat-file", "-e", `${ref}:${repoRelativePath}`],
        repoRootFsPath,
      );
      return true;
    } catch {
      return false;
    }
  }

  // ---- Diff ----

  async showFileAtRef(
    repoRootFsPath: string,
    ref: string,
    repoRelativePath: string,
  ): Promise<string> {
    return await execGit(
      ["show", `${ref}:${repoRelativePath}`],
      repoRootFsPath,
    );
  }

  async showFileAtRefOptional(
    repoRootFsPath: string,
    ref: string,
    repoRelativePath: string,
  ): Promise<string | undefined> {
    try {
      return await this.showFileAtRef(repoRootFsPath, ref, repoRelativePath);
    } catch (e: any) {
      const msg = String(e?.message ?? e);

      const missingPatterns = [
        "exists on disk, but not in",
        "does not exist in",
        "fatal: invalid object name",
        "fatal: bad object",
        "fatal: Not a valid object name",
      ];

      if (missingPatterns.some((p) => msg.includes(p))) {
        return undefined;
      }

      throw e;
    }
  }

  // ---- HEAD ----

  async getHeadMessage(repoRootFsPath: string): Promise<string> {
    const msg = await execGit(["log", "-1", "--pretty=%B"], repoRootFsPath);
    return msg.trim();
  }

  async isHeadEmptyVsParent(repoRootFsPath: string): Promise<boolean> {
    try {
      await execGit(["rev-parse", "--verify", "HEAD^"], repoRootFsPath);
    } catch {
      return false; // first commit — no parent
    }

    try {
      // exit 0 => no diff => HEAD introduced no changes
      await execGit(["diff", "--quiet", "HEAD^", "HEAD"], repoRootFsPath);
      return true;
    } catch {
      // exit 1 => diff exists; any other error => treat as not empty
      return false;
    }
  }

  // ---- Commits ----

  async getUpstreamRef(repoRootFsPath: string): Promise<string> {
    const out = await execGit(
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      repoRootFsPath,
    );
    const upstream = out.trim();
    if (!upstream) {
      throw new Error("No upstream configured for current branch.");
    }
    return upstream;
  }

  async tryGetUpstreamRef(repoRootFsPath: string): Promise<string | undefined> {
    try {
      const out = await execGit(
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        repoRootFsPath,
      );
      return out.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  async listOutgoingCommits(repoRootFsPath: string): Promise<OutgoingCommit[]> {
    const upstream = await this.tryGetUpstreamRef(repoRootFsPath);
    const format = "%H%x1f%h%x1f%s%x1f%an%x1f%aI";
    const rangeArgs = upstream
      ? [`${upstream}..HEAD`]
      : ["HEAD", "--not", "--remotes"];

    const out = await execGit(
      ["--no-pager", "-c", "color.ui=false", "log", `--format=${format}`, ...rangeArgs],
      repoRootFsPath,
    );

    const text = out.trim();
    if (!text) {
      return [];
    }

    return text.split("\n").flatMap((line) => {
      const [hash, shortHash, subject, authorName, authorDateIso] =
        line.split("\x1f");
      if (!hash || !shortHash) {
        return [];
      }
      return [{
        hash,
        shortHash,
        subject: subject ?? "",
        authorName: authorName || undefined,
        authorDateIso: authorDateIso || undefined,
      }];
    });
  }

  async getCommitFiles(
    repoRootFsPath: string,
    commitHash: string,
  ): Promise<CommitFileChange[]> {
    const out = await execGit(
      ["--no-pager", "-c", "color.ui=false", "show", "--name-status", "--format=", commitHash],
      repoRootFsPath,
    );

    const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
    const changes: CommitFileChange[] = [];

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 2) {
        continue;
      }

      const statusRaw = parts[0] ?? "";
      const rawCode = statusRaw[0] ?? "?";

      // Validate status code before casting
      const code = VALID_STATUS_CODES.has(rawCode)
        ? (rawCode as CommitFileChange["status"])
        : ("?" as CommitFileChange["status"]);

      if (code === "R" || code === "C") {
        const oldPath = parts[1] ?? "";
        const newPath = parts[2] ?? "";
        if (newPath) {
          changes.push({ status: code, oldPath, path: newPath });
        }
        continue;
      }

      const p = parts[1] ?? "";
      if (p) {
        changes.push({ status: code, path: p });
      }
    }

    return changes;
  }

  async commit(repoRootFsPath: string, args: string[]): Promise<void> {
    await execGit(["commit", ...args], repoRootFsPath);
  }

  // ---- Push ----

  async push(
    repoRootFsPath: string,
    { amend }: { amend: boolean },
  ): Promise<void> {
    const firstArgs = amend ? ["push", "--force-with-lease"] : ["push"];

    try {
      await execGit(firstArgs, repoRootFsPath);
      return;
    } catch (e) {
      if (!looksLikeNoUpstream(e)) {
        throw e;
      }
    }

    // No upstream — resolve branch and set one
    const out = await execGit(
      ["rev-parse", "--abbrev-ref", "HEAD"],
      repoRootFsPath,
    );
    const branch = out.trim();

    if (!branch || branch === "HEAD") {
      throw new Error("Detached HEAD: cannot push without a branch.");
    }

    const baseArgs = ["push", "-u", "origin", branch];
    await execGit(
      amend ? [...baseArgs, "--force-with-lease"] : baseArgs,
      repoRootFsPath,
    );
  }

  // ---- Discard ----

  async discardFiles(
    repoRootFsPath: string,
    repoRelativePaths: string[],
  ): Promise<void> {
    if (repoRelativePaths.length === 0) {
      return;
    }
    await execGit(
      ["restore", "--staged", "--worktree", "--", ...repoRelativePaths],
      repoRootFsPath,
    );
  }

  // ---- Stash ----

  async stashList(repoRootFsPath: string): Promise<GitStashEntry[]> {
    const out = await execGit(["stash", "list"], repoRootFsPath);
    return out
      .split("\n")
      .map(parseStashLine)
      .filter((e): e is GitStashEntry => e !== null);
  }

  async stashPushPaths(
    repoRootFsPath: string,
    message: string,
    repoRelativePaths: string[],
  ): Promise<void> {
    if (repoRelativePaths.length === 0) {
      throw new Error("No files provided to stash.");
    }
    // Note: `git stash push -- <paths>` silently ignores untracked files.
    // Only tracked (modified/staged) files will be stashed.
    await execGit(
      ["stash", "push", "-m", message, "--", ...repoRelativePaths],
      repoRootFsPath,
    );
  }

  async stashApply(repoRootFsPath: string, ref: string): Promise<void> {
    await execGit(["stash", "apply", ref], repoRootFsPath);
  }

  async stashPop(repoRootFsPath: string, ref: string): Promise<void> {
    await execGit(["stash", "pop", ref], repoRootFsPath);
  }

  async stashDrop(repoRootFsPath: string, ref: string): Promise<void> {
    await execGit(["stash", "drop", ref], repoRootFsPath);
  }

  async stashListFiles(
    repoRootFsPath: string,
    stashRef: string,
  ): Promise<StashFileEntry[]> {
    // Compare stash base commit to stash commit:
    // stashRef^1 is "base" (commit the stash was made from)
    // stashRef is the stash commit object (worktree changes)
    const out = await execGit(
      ["diff", "--name-status", `${stashRef}^1`, stashRef],
      repoRootFsPath,
    );

    const lines = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const files: StashFileEntry[] = [];

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 2) {
        continue;
      }

      const statusRaw = parts[0] ?? "?";
      const code = (statusRaw[0] ?? "?") as StashFileEntry["status"];

      if (code === "R" || code === "C") {
        const oldPath = parts[1] ?? "";
        const newPath = parts[2] ?? "";
        if (newPath) {
          files.push({ status: code, oldPath, path: newPath });
        }
        continue;
      }

      const p = parts[1] ?? "";
      if (p) {
        files.push({ status: code, path: p });
      }
    }

    return files;
  }
}
