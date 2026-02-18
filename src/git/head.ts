import { runGit, runGitCapture } from "../utils/process";

async function headHasParent(repoRoot: string): Promise<boolean> {
  try {
    await runGit(repoRoot, ["rev-parse", "--verify", "HEAD^"]);
    return true;
  } catch {
    return false;
  }
}

export async function isHeadEmptyVsParent(repoRoot: string): Promise<boolean> {
  if (!(await headHasParent(repoRoot))) {
    return false;
  } // first commit case

  try {
    // exit 0 => no diff => empty
    await runGit(repoRoot, ["diff", "--quiet", "HEAD^", "HEAD"]);
    return true;
  } catch (e: any) {
    // exit 1 => diff exists => not empty
    const msg = String(e?.message ?? e);
    if (msg.includes("(code 1)")) {
      return false;
    }
    return false;
  }
}

export async function getHeadMessage(repoRoot: string): Promise<string> {
  const msg = await runGitCapture(repoRoot, ["log", "-1", "--pretty=%B"]);
  return msg.trim();
}
