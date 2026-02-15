import type { PersistedState } from "../adapters/storage/workspaceStateStore";

export interface ChangelistStore {
  load(repoRootFsPath: string): Promise<PersistedState | undefined>;
  save(repoRootFsPath: string, state: PersistedState): Promise<void>;
}
