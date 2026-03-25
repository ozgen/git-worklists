import * as vscode from "vscode";
import {
  BOOKMARK_SLOTS,
  formatBookmarkTarget,
  type BookmarkEntry,
  type BookmarkSlot,
} from "../../core/bookmark/bookmark";

export type NewFileDecision = "add" | "keep" | "disable" | "dismiss";

export class VsCodePrompt {
  async confirmAddNewFiles(
    count: number,
    sample?: string,
  ): Promise<NewFileDecision> {
    const msg =
      count === 1
        ? `Add to Git?\n${sample ?? ""}`.trim()
        : `Add ${count} new files to Git?`;

    const answer = await vscode.window.showInformationMessage(
      msg,
      "Add",
      "Keep Unversioned",
      "Disable prompt",
    );

    if (answer === "Add") {
      return "add";
    }
    if (answer === "Keep Unversioned") {
      return "keep";
    }
    if (answer === "Disable prompt") {
      return "disable";
    }
    return "dismiss";
  }

  async pickBookmarkSlot(): Promise<BookmarkSlot | undefined> {
    const picked = await vscode.window.showQuickPick(
      BOOKMARK_SLOTS.map((slot) => ({
        label: `Bookmark ${slot}`,
        description: `Slot ${slot}`,
        slot,
      })),
      {
        placeHolder: "Select bookmark slot",
        ignoreFocusOut: true,
      },
    );

    return picked?.slot;
  }

  async confirmBookmarkOverwrite(
    existing: BookmarkEntry,
    incoming: BookmarkEntry,
  ): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(
      `Bookmark ${existing.slot} is already set.`,
      {
        modal: true,
        detail: [
          `Current: ${formatBookmarkTarget(existing.target)}`,
          `New: ${formatBookmarkTarget(incoming.target)}`,
          "",
          "Do you want to replace it?",
        ].join("\n"),
      },
      "Replace",
    );

    return answer === "Replace";
  }

  async confirmClearAllBookmarks(count: number): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(
      `Clear all bookmarks?`,
      {
        modal: true,
        detail: `This will remove ${count} bookmark(s) for the current repository.`,
      },
      "Clear All",
    );

    return answer === "Clear All";
  }

  async showInfo(message: string): Promise<void> {
    void vscode.window.showInformationMessage(message);
  }
  
  async showWarning(message: string): Promise<void> {
    void vscode.window.showWarningMessage(message);
  }
}