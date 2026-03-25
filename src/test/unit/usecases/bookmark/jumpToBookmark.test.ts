import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import { JumpToBookmark } from "../../../../usecases/bookmark/jumpToBookmark";
import type { BookmarkRepository } from "../../../../core/bookmark/bookmarkRepository";

vi.mock("fs/promises", () => ({
  stat: vi.fn(),
}));

describe("JumpToBookmark", () => {
  const repoRoot = "/repo";

  let bookmarks: BookmarkRepository;
  let editor: { openTarget: ReturnType<typeof vi.fn> };
  let prompt: {
    showInfo: ReturnType<typeof vi.fn>;
    showWarning: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    bookmarks = {
      getAll: vi.fn(),
      getBySlot: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      clearAll: vi.fn(),
    };

    editor = {
      openTarget: vi.fn().mockResolvedValue(undefined),
    };

    prompt = {
      showInfo: vi.fn().mockResolvedValue(undefined),
      showWarning: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("shows info when bookmark slot is empty", async () => {
    vi.mocked(bookmarks.getBySlot).mockResolvedValue(undefined);

    const usecase = new JumpToBookmark(bookmarks, editor as any, prompt);

    await usecase.run(repoRoot, 1);

    expect(prompt.showInfo).toHaveBeenCalled();
    expect(editor.openTarget).not.toHaveBeenCalled();
  });

  it("opens the bookmarked target when file exists", async () => {
    vi.mocked(bookmarks.getBySlot).mockResolvedValue({
      slot: 1,
      target: {
        repoRelativePath: "src/a.ts",
        line: 10,
        column: 2,
      },
    });
    vi.mocked(fs.stat).mockResolvedValue({} as any);

    const usecase = new JumpToBookmark(bookmarks, editor as any, prompt);

    await usecase.run(repoRoot, 1);

    expect(editor.openTarget).toHaveBeenCalledWith(repoRoot, {
      repoRelativePath: "src/a.ts",
      line: 10,
      column: 2,
    });
  });

  it("shows warning when bookmarked file is missing", async () => {
    vi.mocked(bookmarks.getBySlot).mockResolvedValue({
      slot: 1,
      target: {
        repoRelativePath: "src/a.ts",
        line: 10,
        column: 2,
      },
    });
    vi.mocked(fs.stat).mockRejectedValue(new Error("missing"));

    const usecase = new JumpToBookmark(bookmarks, editor as any, prompt);

    await usecase.run(repoRoot, 1);

    expect(prompt.showWarning).toHaveBeenCalled();
    expect(editor.openTarget).not.toHaveBeenCalled();
  });
});