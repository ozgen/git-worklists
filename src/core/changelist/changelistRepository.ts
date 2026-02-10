import { Changelist } from "./changelist";

export interface ChangelistRepository {
  getAll(repoRootFsPath: string): Promise<Changelist[]>;
  save(repoRootFsPath: string, list: Changelist): Promise<void>;
  delete(repoRootFsPath: string, id: string): Promise<void>;
}
