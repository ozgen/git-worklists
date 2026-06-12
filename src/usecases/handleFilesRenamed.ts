import type { GitClient } from "../adapters/git/gitClient";
import type { ChangelistStore } from "./changelistStore";
import { normalizeRepoRelPath } from "../utils/paths";

export type RenamedFilePair = { oldRelPath: string; newRelPath: string };

export class HandleFilesRenamed {
  constructor(
    private readonly store: ChangelistStore,
    private readonly getRepoRoot: () => string,
    private readonly git?: GitClient,
  ) {}

  async run(renames: RenamedFilePair[]): Promise<void> {
    if (renames.length === 0) {
      return;
    }

    const repoRoot = this.getRepoRoot();
    const state = await this.store.load(repoRoot);
    if (!state || state.version !== 1) {
      return;
    }

    if (this.git) {
      const staged = await this.git.getStagedPaths(repoRoot);
      for (const { oldRelPath, newRelPath } of renames) {
        const normOld = normalizeRepoRelPath(oldRelPath);
        const normNew = normalizeRepoRelPath(newRelPath);
        if (staged.has(normOld)) {
          await this.git.stageMany(repoRoot, [normOld, normNew]).catch(() => {});
        }
      }
    }

    const renameMap = new Map<string, string>();
    for (const { oldRelPath, newRelPath } of renames) {
      renameMap.set(normalizeRepoRelPath(oldRelPath), normalizeRepoRelPath(newRelPath));
    }

    let changed = false;
    const updatedLists = state.lists.map((list) => {
      const mapped = list.files.map((f) => {
        const norm = normalizeRepoRelPath(f);
        const newPath = renameMap.get(norm);
        if (newPath !== undefined) {
          changed = true;
          return newPath;
        }
        return norm;
      });
      const files = [...new Set(mapped)].sort();
      return { ...list, files };
    });

    if (changed) {
      await this.store.save(repoRoot, { ...state, lists: updatedLists });
    }
  }
}
