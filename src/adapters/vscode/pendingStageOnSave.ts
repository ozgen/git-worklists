import { normalizeRepoRelPath } from "../../utils/paths";

export class PendingStageOnSave {
  private readonly byRepo = new Map<string, Set<string>>();

  mark(repoRoot: string, repoRelPath: string) {
    const p = normalizeRepoRelPath(repoRelPath);
    let set = this.byRepo.get(repoRoot);
    if (!set) {
      set = new Set();
      this.byRepo.set(repoRoot, set);
    }
    set.add(p);
  }

  consume(repoRoot: string, repoRelPath: string): boolean {
    const set = this.byRepo.get(repoRoot);
    if (!set) {
      return false;
    }

    const p = normalizeRepoRelPath(repoRelPath);
    const had = set.delete(p);

    if (set.size === 0) {
      this.byRepo.delete(repoRoot);
    }
    return had;
  }
}
