import type { GitClient } from "../adapters/git/gitClient";
import type { ChangelistStore } from "./changelistStore";
import { normalizeRepoRelPath } from "../utils/paths";
import { replacePathInChangelists } from "../core/changelist/replacePathInChangelists";

export type RenamedFilePair = { oldRelPath: string; newRelPath: string };

type ActivePair = {
  normOld: string;
  normNew: string;
};

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

    const activePairs = findActivePairs(state.lists, renames);
    if (activePairs.length === 0) {
      return;
    }

    if (this.git) {
      const staged = await this.git.getStagedPaths(repoRoot);

      for (const { normOld, normNew } of activePairs) {
        if (staged.has(normOld)) {
          await this.git.removeFromIndex(repoRoot, [normOld]);
          await this.git.stageMany(repoRoot, [normNew]);
        }
      }
    }

    let updatedLists = state.lists;
    for (const { normOld, normNew } of activePairs) {
      updatedLists = replacePathInChangelists(updatedLists, normOld, normNew);
    }

    await this.store.save(repoRoot, {
      ...state,
      lists: updatedLists,
    });
  }
}

function findActivePairs(
  lists: { id: string; files: string[] }[],
  renames: RenamedFilePair[],
): ActivePair[] {
  const result: ActivePair[] = [];

  for (const { oldRelPath, newRelPath } of renames) {
    const normOld = normalizeRepoRelPath(oldRelPath);
    const normNew = normalizeRepoRelPath(newRelPath);

    const hasOwner = lists.some((list) =>
      list.files.some((file) => normalizeRepoRelPath(file) === normOld),
    );

    if (hasOwner) {
      result.push({ normOld, normNew });
    }
  }

  return result;
}