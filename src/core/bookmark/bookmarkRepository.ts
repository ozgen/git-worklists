import type { BookmarkEntry, BookmarkSlot } from "./bookmark";

export interface BookmarkRepository {
  getAll(repoRoot: string): Promise<BookmarkEntry[]>;
  getBySlot(
    repoRoot: string,
    slot: BookmarkSlot,
  ): Promise<BookmarkEntry | undefined>;
  set(repoRoot: string, entry: BookmarkEntry): Promise<void>;
  clear(repoRoot: string, slot: BookmarkSlot): Promise<void>;
  clearAll(repoRoot: string): Promise<void>;
}