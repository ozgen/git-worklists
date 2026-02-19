import * as cp from "child_process";
import * as path from "path";
import {
  GitClient,
  GitStatusEntry,
  GitStashEntry,
  OutgoingCommit,
  CommitFileChange,
} from "./gitClient";

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile(
      "git",
      args,
      { cwd, encoding: "utf8" },
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
  });
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

  // Best-effort GW tagging:
  // We will tag stash messages as: "GW:<changelistId> <user message>"
  // That will appear somewhere in the message string.
  let isGitWorklists = false;
  let changelistId: string | undefined;

  // Look for "GW:<id>" token anywhere in the message
  const gw = msg.match(/\bGW:([^\s]+)/);
  if (gw) {
    isGitWorklists = true;
    changelistId = gw[1];
  }

  return {
    ref,
    message: msg,
    raw: trimmed,
    isGitWorklists,
    changelistId,
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

      // After "XY " (3 chars)
      const path1 = header.slice(3);
      if (!path1) {
        continue;
      }

      let finalPath = path1;

      // Rename/copy: old path then new path
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

  async add(repoRootFsPath: string, repoRelativePath: string): Promise<void> {
    await execGit(["add", "--", repoRelativePath], repoRootFsPath);
  }

  async getGitDir(repoRootFsPath: string): Promise<string> {
    const out = await execGit(["rev-parse", "--git-dir"], repoRootFsPath);
    const p = out.trim();
    return path.isAbsolute(p) ? p : path.join(repoRootFsPath, p);
  }

  async tryGetRepoRoot(workspaceFsPath: string): Promise<string | null> {
    try {
      return await this.getRepoRoot(workspaceFsPath);
    } catch {
      return null;
    }
  }

  async isIgnored(
    repoRootFsPath: string,
    repoRelativePath: string,
  ): Promise<boolean> {
    try {
      // -q => quiet, exit code 0 if ignored, 1 if not ignored
      // execGit throws on non-zero, so:
      await execGit(
        ["check-ignore", "-q", "--", repoRelativePath],
        repoRootFsPath,
      );
      return true;
    } catch {
      return false;
    }
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
    await execGit(["reset", "--", ...repoRelativePaths], repoRootFsPath);
  }

  async showFileAtRef(
    repoRootFsPath: string,
    ref: string,
    repoRelativePath: string,
  ): Promise<string> {
    // git show REF:path
    // e.g. "HEAD:src/a.ts"
    return await execGit(
      ["show", `${ref}:${repoRelativePath}`],
      repoRootFsPath,
    );
  }

  async stashList(repoRootFsPath: string): Promise<GitStashEntry[]> {
    const out = await execGit(["stash", "list"], repoRootFsPath);
    const lines = out.split("\n");
    const entries: GitStashEntry[] = [];
    for (const line of lines) {
      const e = parseStashLine(line);
      if (e) {
        entries.push(e);
      }
    }
    return entries;
  }

  async stashPushPaths(
    repoRootFsPath: string,
    message: string,
    repoRelativePaths: string[],
  ): Promise<void> {
    if (repoRelativePaths.length === 0) {
      throw new Error("No files provided to stash.");
    }

    // `--` separates options from pathspecs safely
    // Stash only selected files:
    // git stash push -m "..." -- path1 path2 ...
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

  async getUpstreamRef(repoRootFsPath: string): Promise<string> {
    // Throws if upstream is not configured
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

  async listOutgoingCommits(repoRootFsPath: string): Promise<OutgoingCommit[]> {
    const upstream = await this.tryGetUpstreamRef(repoRootFsPath);

    const format = "%H%x1f%h%x1f%s%x1f%an%x1f%aI";

    // If upstream exists: show exactly what will be pushed.
    // If no upstream: show commits that are not on any remote (best approximation).
    const rangeArgs = upstream
      ? [`${upstream}..HEAD`]
      : ["HEAD", "--not", "--remotes"];

    const out = await execGit(
      [
        "--no-pager",
        "-c",
        "color.ui=false",
        "log",
        `--format=${format}`,
        ...rangeArgs,
      ],
      repoRootFsPath,
    );

    const text = out.trim();
    if (!text) {
      return [];
    }

    const commits: OutgoingCommit[] = [];
    for (const line of text.split("\n")) {
      const [hash, shortHash, subject, authorName, authorDateIso] =
        line.split("\x1f");
      if (!hash || !shortHash) {
        continue;
      }

      commits.push({
        hash,
        shortHash,
        subject: subject ?? "",
        authorName: authorName || undefined,
        authorDateIso: authorDateIso || undefined,
      });
    }

    return commits;
  }

  async getCommitFiles(
    repoRootFsPath: string,
    commitHash: string,
  ): Promise<CommitFileChange[]> {
    // Output lines like:
    // M\tpath
    // A\tpath
    // D\tpath
    // R100\told\tnew
    // C100\told\tnew
    const out = await execGit(
      [
        "--no-pager",
        "-c",
        "color.ui=false",
        "show",
        "--name-status",
        "--format=",
        commitHash,
      ],
      repoRootFsPath,
    );

    const lines = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const changes: CommitFileChange[] = [];

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 2) {
        continue;
      }

      const statusRaw = parts[0] ?? "";
      const code = (statusRaw[0] ?? "?") as CommitFileChange["status"];

      if (code === "R" || code === "C") {
        // R100 old new
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

  async showFileAtRefOptional(
    repoRootFsPath: string,
    ref: string,
    repoRelativePath: string,
  ): Promise<string | undefined> {
    try {
      return await execGit(
        ["show", `${ref}:${repoRelativePath}`],
        repoRootFsPath,
      );
    } catch (e: any) {
      const msg = String(e?.message ?? e);

      // fatal: path 'X' exists on disk, but not in '<ref>'
      if (msg.includes("exists on disk, but not in")) {
        return undefined;
      }

      // Other common “missing” shapes:
      if (msg.includes("does not exist in")) {
        return undefined;
      }
      if (msg.includes("Path '") && msg.includes("' does not exist in")) {
        return undefined;
      }

      // Parent missing / unborn ref / invalid object:
      if (msg.includes("fatal: invalid object name")) {
        return undefined;
      }
      if (msg.includes("fatal: bad object")) {
        return undefined;
      }
      if (msg.includes("fatal: Not a valid object name")) {
        return undefined;
      }

      throw e;
    }
  }

  async tryGetUpstreamRef(repoRootFsPath: string): Promise<string | undefined> {
    try {
      const out = await execGit(
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        repoRootFsPath,
      );
      const upstream = out.trim();
      return upstream || undefined;
    } catch {
      return undefined;
    }
  }
}
