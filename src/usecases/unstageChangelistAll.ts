import { GitClient } from "../adapters/git/gitClient";

export async function unstageChangelistAll(
  git: GitClient,
  repoRootFsPath: string,
  repoRelativePaths: string[],
): Promise<void> {
  await git.unstageMany(repoRootFsPath, repoRelativePaths);
}
