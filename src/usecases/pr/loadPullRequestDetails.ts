import { PrProviderPort } from "../../core/pr/ports/prProviderPort";
import { PullRequestDetails } from "../../core/pr/model/pullRequestDetails";

export class LoadPullRequestDetails {
  constructor(private readonly pr: PrProviderPort) {}
  run(repoRoot: string, prNumber: number): Promise<PullRequestDetails> {
    return this.pr.getDetails(repoRoot, prNumber);
  }
}
