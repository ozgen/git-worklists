import type {
    BookmarkEntry,
    BookmarkSlot,
    BookmarkTarget,
  } from "../../core/bookmark/bookmark";
  import {
    formatBookmarkTarget,
    isSameBookmarkTarget,
  } from "../../core/bookmark/bookmark";
  import type { BookmarkRepository } from "../../core/bookmark/bookmarkRepository";
  
  export interface BookmarkPrompt {
    pickBookmarkSlot(): Promise<BookmarkSlot | undefined>;
    confirmBookmarkOverwrite(
      existing: BookmarkEntry,
      incoming: BookmarkEntry,
    ): Promise<boolean>;
    showInfo(message: string): Promise<void>;
    showWarning(message: string): Promise<void>;
  }
  
  export class SetBookmark {
    constructor(
      private readonly bookmarks: BookmarkRepository,
      private readonly prompt: BookmarkPrompt,
    ) {}
  
    async run(params: {
      repoRoot: string;
      target: BookmarkTarget;
      slot?: BookmarkSlot;
    }): Promise<void> {
      const slot = params.slot ?? (await this.prompt.pickBookmarkSlot());
      if (!slot) {
        return;
      }
  
      const incoming: BookmarkEntry = {
        slot,
        target: params.target,
      };
  
      const existing = await this.bookmarks.getBySlot(params.repoRoot, slot);
  
      if (!existing) {
        await this.bookmarks.set(params.repoRoot, incoming);
        await this.prompt.showInfo(
          `Bookmark ${slot} set to ${formatBookmarkTarget(incoming.target)}`,
        );
        return;
      }
  
      if (isSameBookmarkTarget(existing.target, incoming.target)) {
        await this.prompt.showInfo(
          `Bookmark ${slot} already points to ${formatBookmarkTarget(incoming.target)}`,
        );
        return;
      }
  
      const approved = await this.prompt.confirmBookmarkOverwrite(
        existing,
        incoming,
      );
      if (!approved) {
        return;
      }
  
      await this.bookmarks.set(params.repoRoot, incoming);
      await this.prompt.showInfo(
        `Bookmark ${slot} updated to ${formatBookmarkTarget(incoming.target)}`,
      );
    }
  }