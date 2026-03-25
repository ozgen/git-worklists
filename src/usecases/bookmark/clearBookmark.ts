import type { BookmarkSlot } from "../../core/bookmark/bookmark";
import type { BookmarkRepository } from "../../core/bookmark/bookmarkRepository";

export interface ClearBookmarkPrompt {
  pickBookmarkSlot(): Promise<BookmarkSlot | undefined>;
  showInfo(message: string): Promise<void>;
}

export class ClearBookmark {
  constructor(
    private readonly bookmarks: BookmarkRepository,
    private readonly prompt: ClearBookmarkPrompt,
  ) {}

  async run(repoRoot: string, slot?: BookmarkSlot): Promise<void> {
    const resolvedSlot = slot ?? (await this.prompt.pickBookmarkSlot());
    if (!resolvedSlot) {
      return;
    }

    await this.bookmarks.clear(repoRoot, resolvedSlot);
    await this.prompt.showInfo(`Bookmark ${resolvedSlot} cleared`);
  }
}