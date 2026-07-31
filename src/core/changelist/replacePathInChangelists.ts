function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

export type ChangelistLike = { id: string; files: string[] };

export function replacePathInChangelists<T extends ChangelistLike>(
  lists: T[],
  oldPath: string,
  newPath: string,
): T[] {
  const normOld = norm(oldPath);
  const normNew = norm(newPath);

  const owner = lists.find((list) => list.files.some((f) => norm(f) === normOld));
  if (!owner) {
    return lists;
  }

  return lists.map((list) => {
    const cleaned = list.files.map(norm).filter((f) => f !== normOld && f !== normNew);
    const files = list.id === owner.id ? [...cleaned, normNew] : cleaned;
    return { ...list, files: [...new Set(files)].sort() };
  });
}
