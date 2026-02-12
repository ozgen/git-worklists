import { GitClient, GitStashEntry } from "../../adapters/git/gitClient";

export class ListStashes {
  constructor(private readonly git: GitClient) {}

  async run(repoRootFsPath: string): Promise<GitStashEntry[]> {
    return this.git.stashList(repoRootFsPath);
  }
}
