import { PrProviderPort } from "../../core/pr/ports/prProviderPort";
import { PullRequest } from "../../core/pr/model/pullRequest";

export class ListOpenPullRequests {
  constructor(private readonly pr: PrProviderPort) {}
  run(repoRoot: string): Promise<PullRequest[]> {
    return this.pr.listOpen(repoRoot);
  }
}
