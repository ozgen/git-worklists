import * as cp from "child_process";
import * as path from "path";
import { GitClient, GitStatusEntry, GitStashEntry } from "./gitClient";

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

  async addMany(
    repoRootFsPath: string,
    repoRelativePaths: string[],
  ): Promise<void> {
    if (repoRelativePaths.length === 0) {
      return;
    }
    await execGit(["add", "--", ...repoRelativePaths], repoRootFsPath);
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
}
