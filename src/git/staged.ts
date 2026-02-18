import { normalizeRepoRelPath } from "../utils/paths";
import { runGit, runGitCapture } from "../utils/process";

export async function getStagedPaths(repoRoot: string): Promise<Set<string>> {
  const out = await runGitCapture(repoRoot, ["status", "--porcelain=v1", "-z"]);

  const staged = new Set<string>();
  const entries = out.split("\0").filter(Boolean);

  for (const e of entries) {
    // v1 format: XY<space>path
    // "M  file" => staged (index)
    // " M file" => not staged (working tree)
    // "?? file" => untracked
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

export async function stagePaths(repoRoot: string, paths: string[]) {
  const normalized = paths.map(normalizeRepoRelPath).filter(Boolean);
  if (normalized.length === 0) {
    return;
  }
  await runGit(repoRoot, ["add", "--", ...normalized]);
}

export async function unstagePaths(repoRoot: string, paths: string[]) {
  const normalized = paths.map(normalizeRepoRelPath).filter(Boolean);
  if (normalized.length === 0) {
    return;
  }

  // Only attempt to unstage paths that are actually staged.
  const staged = await getStagedPaths(repoRoot);
  const toUnstage = normalized.filter((p) => staged.has(p));

  // If nothing is staged, treat it as a no-op (no error).
  if (toUnstage.length === 0) {
    return;
  }

  await runGit(repoRoot, ["restore", "--staged", "--", ...toUnstage]);
}
