export class Changelist {
  private readonly files = new Set<string>();

  constructor(
    readonly id: string,
    readonly name: string,
    initialFiles: Iterable<string> = [],
  ) {
    for (const f of initialFiles) {this.files.add(normalizeRepoRelPath(f));}
  }

  addFile(repoRelativePath: string) {
    this.files.add(normalizeRepoRelPath(repoRelativePath));
  }

  removeFile(repoRelativePath: string) {
    this.files.delete(normalizeRepoRelPath(repoRelativePath));
  }

  hasFile(repoRelativePath: string): boolean {
    return this.files.has(normalizeRepoRelPath(repoRelativePath));
  }

  listFiles(): string[] {
    return [...this.files].sort();
  }
}

function normalizeRepoRelPath(p: string): string {
  return p.replace(/\\/g, "/");
}
