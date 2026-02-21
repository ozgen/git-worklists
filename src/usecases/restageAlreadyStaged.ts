import { Deps } from "../app/types";

export class RestageAlreadyStaged {
  constructor(private readonly git: Deps["git"]) {}

  async run(repoRoot: string, stagedPaths: Set<string>): Promise<void> {
    if (stagedPaths.size === 0) {
      return;
    }

    for (const p of stagedPaths) {
      await this.git.add(repoRoot, p);
    }
  }
}
