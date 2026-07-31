import { GitClient } from "../adapters/git/gitClient";
import { RenameMapping } from "../core/rename/renameMapping";

export class RevertPaths {
  constructor(
    private readonly git: GitClient,
    private readonly renameMapping: RenameMapping,
  ) {}

  async run(repoRoot: string, paths: string[]): Promise<void> {
    const plain: string[] = [];

    for (const p of paths) {
      const oldPath = this.renameMapping.resolveOldPath(repoRoot, p);
      if (oldPath) {
        await this.git.revertRename(repoRoot, oldPath, p);
      } else {
        plain.push(p);
      }
    }

    await this.git.discardFiles(repoRoot, plain);
  }
}
