import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClearAllBookmarks } from "../../../../usecases/bookmark/clearAllBookmarks";
import type { BookmarkRepository } from "../../../../core/bookmark/bookmarkRepository";

describe("ClearAllBookmarks", () => {
  const repoRoot = "/repo";

  let bookmarks: BookmarkRepository;
  let prompt: {
    confirmClearAllBookmarks: ReturnType<typeof vi.fn>;
    showInfo: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    bookmarks = {
      getAll: vi.fn(),
      getBySlot: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      clearAll: vi.fn(),
    };

    prompt = {
      confirmClearAllBookmarks: vi.fn(),
      showInfo: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("shows info when there are no bookmarks", async () => {
    vi.mocked(bookmarks.getAll).mockResolvedValue([]);

    const usecase = new ClearAllBookmarks(bookmarks, prompt);

    await usecase.run(repoRoot);

    expect(prompt.showInfo).toHaveBeenCalled();
    expect(bookmarks.clearAll).not.toHaveBeenCalled();
  });

  it("clears all when confirmed", async () => {
    vi.mocked(bookmarks.getAll).mockResolvedValue([
      { slot: 1, target: { repoRelativePath: "a.ts", line: 0, column: 0 } },
    ]);
    prompt.confirmClearAllBookmarks.mockResolvedValue(true);

    const usecase = new ClearAllBookmarks(bookmarks, prompt);

    await usecase.run(repoRoot);

    expect(bookmarks.clearAll).toHaveBeenCalledWith(repoRoot);
  });

  it("does not clear all when confirmation is rejected", async () => {
    vi.mocked(bookmarks.getAll).mockResolvedValue([
      { slot: 1, target: { repoRelativePath: "a.ts", line: 0, column: 0 } },
    ]);
    prompt.confirmClearAllBookmarks.mockResolvedValue(false);

    const usecase = new ClearAllBookmarks(bookmarks, prompt);

    await usecase.run(repoRoot);

    expect(bookmarks.clearAll).not.toHaveBeenCalled();
  });
});