import { WorkspaceStateStore } from "../../adapters/storage/workspaceStateStore";
import { GitClient } from "../../adapters/git/gitClient";
import { normalizeRepoRelPath } from "../../utils/paths";

export class CreateStashForChangelist {
  constructor(
    private readonly git: GitClient,
    private readonly store: WorkspaceStateStore,
  ) {}

  async run(params: {
    repoRootFsPath: string;
    changelistId: string;
    message?: string;
  }): Promise<{
    stashedCount: number;
    skippedUntrackedCount: number;
  }> {
    const { repoRootFsPath, changelistId } = params;

    const persisted = await this.store.load(repoRootFsPath);
    const list = persisted?.lists?.find((l) => l.id === changelistId);
    if (!list) {
      throw new Error(`Changelist not found: ${changelistId}`);
    }

    const files = (list.files ?? []).map(normalizeRepoRelPath);
    if (files.length === 0) {
      throw new Error("This changelist has no files.");
    }

    // Filter out untracked files using status porcelain.
    // Untracked entries are "??".
    const status = await this.git.getStatusPorcelainZ(repoRootFsPath);
    const untracked = new Set(
      status
        .filter((e) => e.x === "?" && e.y === "?")
        .map((e) => normalizeRepoRelPath(e.path)),
    );

    const stashable: string[] = [];
    let skippedUntrackedCount = 0;

    for (const p of files) {
      if (untracked.has(p)) {
        skippedUntrackedCount++;
        continue;
      }
      stashable.push(p);
    }

    if (stashable.length === 0) {
      throw new Error(
        "Nothing to stash (this changelist contains only untracked files).",
      );
    }

    const userMsg = (params.message ?? "").trim();
    const msg = userMsg
      ? `GW:${changelistId} ${userMsg}`
      : `GW:${changelistId}`;

    await this.git.stashPushPaths(repoRootFsPath, msg, stashable);

    return {
      stashedCount: stashable.length,
      skippedUntrackedCount,
    };
  }
}
