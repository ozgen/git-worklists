import { Changelist } from "../core/changelist/Changelist";
import { SystemChangelist } from "../core/changelist/SystemChangelist";
import { GitClient } from "../adapters/git/GitClient";
import {
  WorkspaceStateStore,
  PersistedState,
} from "../adapters/storage/WorkspaceStateStore";

export class InitializeWorkspace {
  constructor(
    private readonly git: GitClient,
    private readonly store: WorkspaceStateStore,
  ) {}

  async run(workspaceFsPath: string): Promise<void> {
    const repoRoot = await this.git.getRepoRoot(workspaceFsPath);
    const status = await this.git.getStatusPorcelainZ(repoRoot);

    const unversioned = new Changelist(
      SystemChangelist.Unversioned,
      "Unversioned",
    );
    const def = new Changelist(SystemChangelist.Default, "Changes");

    for (const e of status) {
      if (e.x === "?" && e.y === "?") {
        unversioned.addFile(e.path);
      } else {
        def.addFile(e.path);
      }
    }

    const persisted: PersistedState = {
      version: 1,
      lists: [
        {
          id: unversioned.id,
          name: unversioned.name,
          files: unversioned.listFiles(),
        },
        { id: def.id, name: def.name, files: def.listFiles() },
      ],
    };

    await this.store.save(repoRoot, persisted);
  }
}
