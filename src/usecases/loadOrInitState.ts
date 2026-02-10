import { GitClient } from "../adapters/git/gitClient";
import {
  WorkspaceStateStore,
  PersistedState,
} from "../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../core/changelist/systemChangelist";

export class LoadOrInitState {
  constructor(
    private readonly git: GitClient,
    private readonly store: WorkspaceStateStore,
  ) {}

  async run(
    workspaceFsPath: string,
  ): Promise<{ repoRoot: string; state: PersistedState }> {
    const repoRoot = await this.git.getRepoRoot(workspaceFsPath);

    const existing = await this.store.load(repoRoot);
    if (existing?.version === 1) {
      const ensured = ensureSystemLists(existing);
      if (ensured !== existing) {
        await this.store.save(repoRoot, ensured);
      }
      return { repoRoot, state: ensured };
    }

    const fresh: PersistedState = {
      version: 1,
      lists: [
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
      ],
    };

    await this.store.save(repoRoot, fresh);
    return { repoRoot, state: fresh };
  }
}

function ensureSystemLists(state: PersistedState): PersistedState {
  const hasUnversioned = state.lists.some(
    (l) => l.id === SystemChangelist.Unversioned,
  );
  const hasDefault = state.lists.some((l) => l.id === SystemChangelist.Default);

  if (hasUnversioned && hasDefault) {
    return state;
  }

  return {
    ...state,
    lists: [
      ...(hasUnversioned
        ? []
        : [
            {
              id: SystemChangelist.Unversioned,
              name: "Unversioned",
              files: [],
            },
          ]),
      ...(hasDefault
        ? []
        : [{ id: SystemChangelist.Default, name: "Changes", files: [] }]),
      ...state.lists,
    ],
  };
}
