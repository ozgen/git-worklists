import { runGit, runGitCapture } from "../utils/process";

async function getCurrentBranch(repoRoot: string): Promise<string> {
  const out = await runGitCapture(repoRoot, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  const branch = out.trim();

  if (!branch || branch === "HEAD") {
    throw new Error("Detached HEAD: cannot push without a branch.");
  }
  return branch;
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

export async function pushWithUpstreamFallback(
  repoRoot: string,
  { amend }: { amend: boolean },
): Promise<void> {
  try {
    await runGit(repoRoot, amend ? ["push", "--force-with-lease"] : ["push"]);
    return;
  } catch (e) {
    if (!looksLikeNoUpstream(e)) {
      throw e;
    }
  }

  const branch = await getCurrentBranch(repoRoot);

  const baseArgs = ["push", "-u", "origin", branch];
  const args = amend ? [...baseArgs, "--force-with-lease"] : baseArgs;

  await runGit(repoRoot, args);
}
