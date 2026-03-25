import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClearBookmark } from "../../../../usecases/bookmark/clearBookmark";
import type { BookmarkRepository } from "../../../../core/bookmark/bookmarkRepository";

describe("ClearBookmark", () => {
  const repoRoot = "/repo";

  let bookmarks: BookmarkRepository;
  let prompt: {
    pickBookmarkSlot: ReturnType<typeof vi.fn>;
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
      pickBookmarkSlot: vi.fn(),
      showInfo: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("clears the given slot", async () => {
    const usecase = new ClearBookmark(bookmarks, prompt);

    await usecase.run(repoRoot, 2);

    expect(bookmarks.clear).toHaveBeenCalledWith(repoRoot, 2);
  });

  it("uses picker when slot is omitted", async () => {
    prompt.pickBookmarkSlot.mockResolvedValue(4);

    const usecase = new ClearBookmark(bookmarks, prompt);

    await usecase.run(repoRoot);

    expect(bookmarks.clear).toHaveBeenCalledWith(repoRoot, 4);
  });

  it("does nothing when picker is canceled", async () => {
    prompt.pickBookmarkSlot.mockResolvedValue(undefined);

    const usecase = new ClearBookmark(bookmarks, prompt);

    await usecase.run(repoRoot);

    expect(bookmarks.clear).not.toHaveBeenCalled();
  });
});