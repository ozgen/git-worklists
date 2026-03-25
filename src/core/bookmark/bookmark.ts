export const BOOKMARK_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type BookmarkSlot = (typeof BOOKMARK_SLOTS)[number];

export interface BookmarkTarget {
  repoRelativePath: string;
  line: number;
  column: number;
}

export interface BookmarkEntry {
  slot: BookmarkSlot;
  target: BookmarkTarget;
}

export function isValidBookmarkSlot(value: number): value is BookmarkSlot {
  return BOOKMARK_SLOTS.includes(value as BookmarkSlot);
}

export function isSameBookmarkTarget(
  a: BookmarkTarget,
  b: BookmarkTarget,
): boolean {
  return (
    a.repoRelativePath === b.repoRelativePath &&
    a.line === b.line &&
    a.column === b.column
  );
}

export function formatBookmarkTarget(target: BookmarkTarget): string {
  return `${target.repoRelativePath}:${target.line + 1}:${target.column + 1}`;
}
