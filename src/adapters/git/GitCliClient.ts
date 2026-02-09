import * as cp from "child_process";
import { GitClient, GitStatusEntry } from "./GitClient";

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

export class GitCliClient implements GitClient {
  async getRepoRoot(workspaceFsPath: string): Promise<string> {
    const out = await execGit(
      ["rev-parse", "--show-toplevel"],
      workspaceFsPath,
    );
    return out.trim();
  }

  async getStatusPorcelainZ(repoRootFsPath: string): Promise<GitStatusEntry[]> {
    // -z = NUL separated, safest for weird file names
    const out = await execGit(
      ["status", "--porcelain=v1", "-z"],
      repoRootFsPath,
    );

    const entries: GitStatusEntry[] = [];
    const parts = out.split("\0").filter(Boolean);

    for (const part of parts) {
      // Format: XY<space>path  OR  XY<space>old -> new  (for renames)
      const x = part[0] ?? " ";
      const y = part[1] ?? " ";
      const rest = part.slice(3); // skip "XY "
      if (!rest) continue;

      // if rename "old -> new", we store the new path
      const path = rest.includes(" -> ")
        ? rest.split(" -> ").pop()!.trim()
        : rest.trim();

      entries.push({ path, x, y });
    }

    return entries;
  }
}
