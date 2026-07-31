import { UnstagePaths } from "./unstagePaths";

export async function unstageChangelistAll(
  unstagePaths: UnstagePaths,
  repoRootFsPath: string,
  repoRelativePaths: string[],
): Promise<void> {
  await unstagePaths.run(repoRootFsPath, repoRelativePaths);
}
