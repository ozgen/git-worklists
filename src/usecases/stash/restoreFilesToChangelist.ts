import { normalizeRepoRelPath } from "../../utils/paths";
import { SystemChangelist } from "../../core/changelist/systemChangelist";
import { ChangelistStore } from "../changelistStore";

export class RestoreFilesToChangelist {
  constructor(private readonly store: ChangelistStore) {}

  async run(
    repoRoot: string,
    changelistName: string,
    filePaths: string[],
  ): Promise<void> {
    if (filePaths.length === 0) {
      return;
    }

    const normalized = filePaths.map(normalizeRepoRelPath);

    const state = await this.store.load(repoRoot);
    if (!state || state.version !== 1) {
      return;
    }

    const targetId = resolveTargetId(state.lists, changelistName);

    const next = state.lists.map((l) => {
      const files = l.files.map(normalizeRepoRelPath).filter(
        (f) => !normalized.includes(f),
      );
      if (l.id === targetId) {
        const merged = Array.from(new Set([...files, ...normalized])).sort();
        return { ...l, files: merged };
      }
      return { ...l, files };
    });

    await this.store.save(repoRoot, { ...state, lists: next });
  }
}

function resolveTargetId(
  lists: Array<{ id: string; name: string }>,
  changelistName: string,
): string {
  if (!changelistName || changelistName.toLowerCase() === "staged") {
    return SystemChangelist.Default;
  }

  const match = lists.find(
    (l) => l.name.toLowerCase() === changelistName.toLowerCase(),
  );

  return match?.id ?? SystemChangelist.Default;
}
