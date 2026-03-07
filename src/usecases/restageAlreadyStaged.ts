import { Deps } from "../app/types";

export class RestageAlreadyStaged {
  constructor(private readonly git: Deps["git"]) {}

  async run(repoRoot: string, stagedPaths: Set<string>): Promise<void> {
    if (stagedPaths.size === 0) {
      return;
    }

    const entries = await this.git.getStatusPorcelainZ(repoRoot);
    const byPath = new Map(entries.map((e) => [e.path, e]));

    for (const path of stagedPaths) {
      const entry = byPath.get(path);
      if (!entry) {
        continue;
      }

      // Refresh newly added files that changed after initial staging.
      // Preserve tracked partial staging (MM).
      if (entry.x === "A" && entry.y === "M") {
        await this.git.add(repoRoot, path);
      }
    }
  }
}
