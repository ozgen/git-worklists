import { PrProviderPort } from "../../core/pr/ports/prProviderPort";
import { ReviewAction } from "../../core/pr/model/reviewAction";

export class SubmitPullRequestReview {
  constructor(private readonly pr: PrProviderPort) {}
  run(
    repoRoot: string,
    prNumber: number,
    action: ReviewAction,
    body?: string,
  ): Promise<void> {
    return this.pr.submitReview(repoRoot, prNumber, action, body);
  }
}
