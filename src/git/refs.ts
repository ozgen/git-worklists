import { runGit } from "../utils/process";

export async function isNewFileInRepo(
  repoRoot: string,
  rel: string,
): Promise<boolean> {
  try {
    await runGit(repoRoot, ["cat-file", "-e", `HEAD:${rel}`]);
    return false;
  } catch {
    return true;
  }
}

export async function fileExistsAtRef(
  repoRoot: string,
  ref: string,
  rel: string,
): Promise<boolean> {
  try {
    await runGit(repoRoot, ["cat-file", "-e", `${ref}:${rel}`]);
    return true;
  } catch {
    return false;
  }
}
