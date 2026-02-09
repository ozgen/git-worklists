export class Changelist {
  private readonly files = new Set<string>();

  constructor(
    readonly id: string,
    readonly name: string,
    initialFiles: Iterable<string> = [],
  ) {
    for (const f of initialFiles) this.files.add(f);
  }

  addFile(repoRelativePath: string) {
    this.files.add(repoRelativePath);
  }

  removeFile(repoRelativePath: string) {
    this.files.delete(repoRelativePath);
  }

  hasFile(repoRelativePath: string): boolean {
    return this.files.has(repoRelativePath);
  }

  listFiles(): string[] {
    return [...this.files].sort();
  }
}
