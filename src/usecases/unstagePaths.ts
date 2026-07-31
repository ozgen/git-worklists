import { GitClient } from "../adapters/git/gitClient";
import { RenameMapping } from "../core/rename/renameMapping";

export class UnstagePaths {
  constructor(
    private readonly git: GitClient,
    private readonly renameMapping: RenameMapping,
  ) {}

  async run(repoRoot: string, paths: string[]): Promise<void> {
    const expanded = new Set<string>();

    for (const p of paths) {
      expanded.add(p);
      const oldPath = this.renameMapping.resolveOldPath(repoRoot, p);
      if (oldPath) {
        expanded.add(oldPath);
      }
    }

    await this.git.unstageMany(repoRoot, [...expanded]);
  }
}
