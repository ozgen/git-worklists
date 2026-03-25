import * as fs from "fs/promises";
import * as path from "path";
import type { BookmarkSlot } from "../../core/bookmark/bookmark";
import type { BookmarkRepository } from "../../core/bookmark/bookmarkRepository";
import type { VsCodeBookmarkEditor } from "../../adapters/vscode/bookmarkEditor";

export interface JumpBookmarkPrompt {
  showInfo(message: string): Promise<void>;
  showWarning(message: string): Promise<void>;
}

export class JumpToBookmark {
  constructor(
    private readonly bookmarks: BookmarkRepository,
    private readonly editor: VsCodeBookmarkEditor,
    private readonly prompt: JumpBookmarkPrompt,
  ) {}

  async run(repoRoot: string, slot: BookmarkSlot): Promise<void> {
    const entry = await this.bookmarks.getBySlot(repoRoot, slot);
    if (!entry) {
      await this.prompt.showInfo(`Bookmark ${slot} is empty`);
      return;
    }

    const absolutePath = path.join(repoRoot, entry.target.repoRelativePath);

    try {
      await fs.stat(absolutePath);
    } catch {
      await this.prompt.showWarning(
        `Bookmark ${slot} points to a missing file: ${entry.target.repoRelativePath}`,
      );
      return;
    }

    await this.editor.openTarget(repoRoot, entry.target);
  }
}
