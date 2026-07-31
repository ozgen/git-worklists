import { GitClient } from "../adapters/git/gitClient";
import { RenameMapping } from "../core/rename/renameMapping";

export class StagePaths {
  constructor(
    private readonly git: GitClient,
    private readonly renameMapping: RenameMapping,
  ) {}

  async run(repoRoot: string, paths: string[]): Promise<void> {
    const plain: string[] = [];

    for (const p of paths) {
      const oldPath = this.renameMapping.resolveOldPath(repoRoot, p);
      if (oldPath) {
        await this.git.stageRename(repoRoot, oldPath, p);
      } else {
        plain.push(p);
      }
    }

    await this.git.stageMany(repoRoot, plain);
  }
}
