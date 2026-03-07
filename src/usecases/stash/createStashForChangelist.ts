import { GitClient } from "../../adapters/git/gitClient";
import { WorkspaceStateStore } from "../../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../../core/changelist/systemChangelist";
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

    const changelistName = (list.name ?? "").trim();
    if (!changelistName) {
      throw new Error("Changelist has no valid name.");
    }

    const userMsg = (params.message ?? "").trim();
    const encodedChangelistName = encodeURIComponent(changelistName);
    const msg = userMsg
      ? `GW:${encodedChangelistName} ${userMsg}`
      : `GW:${encodedChangelistName}`;

    if (changelistId === SystemChangelist.Unversioned) {
      const status = await this.git.getStatusPorcelainZ(repoRootFsPath);

      const untrackedNow = new Set(
        status
          .filter((e) => e.x === "?" && e.y === "?")
          .map((e) => normalizeRepoRelPath(e.path)),
      );

      const filesStillUntracked = files.filter((path) =>
        untrackedNow.has(path),
      );

      if (filesStillUntracked.length === 0) {
        throw new Error(
          "Nothing to stash (this changelist contains no untracked files).",
        );
      }

      await this.git.stashPushPaths(repoRootFsPath, msg, filesStillUntracked, {
        includeUntracked: true,
      });

      return {
        stashedCount: filesStillUntracked.length,
        skippedUntrackedCount: files.length - filesStillUntracked.length,
      };
    }

    const status = await this.git.getStatusPorcelainZ(repoRootFsPath);
    const untrackedInStatus = new Set(
      status
        .filter((e) => e.x === "?" && e.y === "?")
        .map((e) => normalizeRepoRelPath(e.path)),
    );

    const trackedFiles = files.filter((p) => !untrackedInStatus.has(p));
    const skippedUntrackedCount = files.length - trackedFiles.length;

    if (trackedFiles.length === 0) {
      throw new Error(
        "Nothing to stash (this changelist contains only untracked files).",
      );
    }

    await this.git.stashPushPaths(repoRootFsPath, msg, trackedFiles, {
      includeUntracked: false,
    });

    return { stashedCount: trackedFiles.length, skippedUntrackedCount };
  }
}
