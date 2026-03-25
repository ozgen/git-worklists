import type { BookmarkRepository } from "../../core/bookmark/bookmarkRepository";

export interface ClearAllBookmarksPrompt {
  confirmClearAllBookmarks(count: number): Promise<boolean>;
  showInfo(message: string): Promise<void>;
}

export class ClearAllBookmarks {
  constructor(
    private readonly bookmarks: BookmarkRepository,
    private readonly prompt: ClearAllBookmarksPrompt,
  ) {}

  async run(repoRoot: string): Promise<void> {
    const all = await this.bookmarks.getAll(repoRoot);
    if (all.length === 0) {
      await this.prompt.showInfo("No bookmarks to clear");
      return;
    }

    const approved = await this.prompt.confirmClearAllBookmarks(all.length);
    if (!approved) {
      return;
    }

    await this.bookmarks.clearAll(repoRoot);
    await this.prompt.showInfo(`Cleared ${all.length} bookmark(s)`);
  }
}