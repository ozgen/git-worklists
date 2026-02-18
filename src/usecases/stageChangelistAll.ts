import { GitClient } from "../adapters/git/gitClient";

export async function stageChangelistAll(
  git: GitClient,
  repoRootFsPath: string,
  repoRelativePaths: string[],
): Promise<void> {
  await git.stageMany(repoRootFsPath, repoRelativePaths);
}
