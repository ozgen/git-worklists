function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

export type RenamePair = { oldPath: string; newPath: string };

export class RenameMapping {
  private readonly byRepo = new Map<string, Map<string, string>>();

  record(repoRoot: string, oldPath: string, newPath: string): void {
    let forRepo = this.byRepo.get(repoRoot);
    if (!forRepo) {
      forRepo = new Map();
      this.byRepo.set(repoRoot, forRepo);
    }
    forRepo.set(norm(newPath), norm(oldPath));
  }

  resolveOldPath(repoRoot: string, newPath: string): string | undefined {
    return this.byRepo.get(repoRoot)?.get(norm(newPath));
  }

  hasOldPath(repoRoot: string, oldPath: string): boolean {
    const forRepo = this.byRepo.get(repoRoot);
    if (!forRepo) {
      return false;
    }
    const target = norm(oldPath);
    for (const recordedOldPath of forRepo.values()) {
      if (recordedOldPath === target) {
        return true;
      }
    }
    return false;
  }

  entries(repoRoot: string): RenamePair[] {
    const forRepo = this.byRepo.get(repoRoot);
    if (!forRepo) {
      return [];
    }
    return [...forRepo].map(([newPath, oldPath]) => ({ oldPath, newPath }));
  }

  pruneRepo(repoRoot: string, keepIf: (oldPath: string) => boolean): void {
    const forRepo = this.byRepo.get(repoRoot);
    if (!forRepo) {
      return;
    }
    for (const [newPath, oldPath] of forRepo) {
      if (!keepIf(oldPath)) {
        forRepo.delete(newPath);
      }
    }
  }
}
