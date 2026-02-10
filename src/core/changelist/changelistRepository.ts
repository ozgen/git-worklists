import { Changelist } from "./changelist";

export interface ChangelistRepository {
  getAll(): Promise<Changelist[]>;
  save(list: Changelist): Promise<void>;
  delete(id: string): Promise<void>;
}
