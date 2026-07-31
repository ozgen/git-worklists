import { StagePaths } from "./stagePaths";

export async function stageChangelistAll(
  stagePaths: StagePaths,
  repoRootFsPath: string,
  repoRelativePaths: string[],
): Promise<void> {
  await stagePaths.run(repoRootFsPath, repoRelativePaths);
}
