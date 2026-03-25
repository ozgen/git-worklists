import { describe, expect, it, vi, beforeEach } from "vitest";
import { SetBookmark } from "../../../../usecases/bookmark/setBookmark";
import type {
  BookmarkEntry,
  BookmarkSlot,
  BookmarkTarget,
} from "../../../../core/bookmark/bookmark";
import type { BookmarkRepository } from "../../../../core/bookmark/bookmarkRepository";

function makeTarget(
  repoRelativePath: string,
  line = 0,
  column = 0,
): BookmarkTarget {
  return { repoRelativePath, line, column };
}

describe("SetBookmark", () => {
  const repoRoot = "/repo";

  let bookmarks: BookmarkRepository;
  let prompt: {
    pickBookmarkSlot: ReturnType<typeof vi.fn>;
    confirmBookmarkOverwrite: ReturnType<typeof vi.fn>;
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

    prompt = {
      pickBookmarkSlot: vi.fn(),
      confirmBookmarkOverwrite: vi.fn(),
      showInfo: vi.fn().mockResolvedValue(undefined),
      showWarning: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("saves a bookmark when slot is empty", async () => {
    vi.mocked(bookmarks.getBySlot).mockResolvedValue(undefined);

    const usecase = new SetBookmark(bookmarks, prompt);

    await usecase.run({
      repoRoot,
      slot: 1,
      target: makeTarget("src/a.ts", 10, 2),
    });

    expect(bookmarks.set).toHaveBeenCalledWith(repoRoot, {
      slot: 1,
      target: makeTarget("src/a.ts", 10, 2),
    });
    expect(prompt.confirmBookmarkOverwrite).not.toHaveBeenCalled();
  });

  it("does not overwrite when target is the same", async () => {
    const existing: BookmarkEntry = {
      slot: 1,
      target: makeTarget("src/a.ts", 10, 2),
    };

    vi.mocked(bookmarks.getBySlot).mockResolvedValue(existing);

    const usecase = new SetBookmark(bookmarks, prompt);

    await usecase.run({
      repoRoot,
      slot: 1,
      target: makeTarget("src/a.ts", 10, 2),
    });

    expect(bookmarks.set).not.toHaveBeenCalled();
    expect(prompt.confirmBookmarkOverwrite).not.toHaveBeenCalled();
  });

  it("asks before overwriting an occupied slot", async () => {
    const existing: BookmarkEntry = {
      slot: 1,
      target: makeTarget("src/old.ts", 1, 0),
    };

    vi.mocked(bookmarks.getBySlot).mockResolvedValue(existing);
    prompt.confirmBookmarkOverwrite.mockResolvedValue(true);

    const usecase = new SetBookmark(bookmarks, prompt);

    await usecase.run({
      repoRoot,
      slot: 1,
      target: makeTarget("src/new.ts", 5, 1),
    });

    expect(prompt.confirmBookmarkOverwrite).toHaveBeenCalledWith(existing, {
      slot: 1,
      target: makeTarget("src/new.ts", 5, 1),
    });
    expect(bookmarks.set).toHaveBeenCalledWith(repoRoot, {
      slot: 1,
      target: makeTarget("src/new.ts", 5, 1),
    });
  });

  it("does not overwrite when user rejects confirmation", async () => {
    const existing: BookmarkEntry = {
      slot: 1,
      target: makeTarget("src/old.ts", 1, 0),
    };

    vi.mocked(bookmarks.getBySlot).mockResolvedValue(existing);
    prompt.confirmBookmarkOverwrite.mockResolvedValue(false);

    const usecase = new SetBookmark(bookmarks, prompt);

    await usecase.run({
      repoRoot,
      slot: 1,
      target: makeTarget("src/new.ts", 5, 1),
    });

    expect(bookmarks.set).not.toHaveBeenCalled();
  });

  it("uses picked slot when slot is omitted", async () => {
    vi.mocked(bookmarks.getBySlot).mockResolvedValue(undefined);
    prompt.pickBookmarkSlot.mockResolvedValue(3 satisfies BookmarkSlot);

    const usecase = new SetBookmark(bookmarks, prompt);

    await usecase.run({
      repoRoot,
      target: makeTarget("src/a.ts", 3, 4),
    });

    expect(prompt.pickBookmarkSlot).toHaveBeenCalled();
    expect(bookmarks.set).toHaveBeenCalledWith(repoRoot, {
      slot: 3,
      target: makeTarget("src/a.ts", 3, 4),
    });
  });

  it("does nothing when slot picker is canceled", async () => {
    prompt.pickBookmarkSlot.mockResolvedValue(undefined);

    const usecase = new SetBookmark(bookmarks, prompt);

    await usecase.run({
      repoRoot,
      target: makeTarget("src/a.ts", 3, 4),
    });

    expect(bookmarks.getBySlot).not.toHaveBeenCalled();
    expect(bookmarks.set).not.toHaveBeenCalled();
  });
});