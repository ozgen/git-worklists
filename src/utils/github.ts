import { runGhCapture } from "./process";

export async function getRepoNameWithOwner(repoRoot: string): Promise<string> {
  const out = await runGhCapture(repoRoot, [
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);

  const slug = out.trim();
  if (!slug.includes("/")) {
    throw new Error("Cannot determine repo nameWithOwner via gh.");
  }
  return slug;
}
