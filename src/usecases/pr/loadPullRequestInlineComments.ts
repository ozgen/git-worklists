import { PrInlineComment } from "../../core/pr/model/prInlineComment";
import { PrProviderPort } from "../../core/pr/ports/prProviderPort";

export class LoadPullRequestInlineComments {
  constructor(private readonly pr: PrProviderPort) {}

  run(repoRoot: string, prNumber: number): Promise<PrInlineComment[]> {
    return this.pr.listInlineReviewComments(repoRoot, prNumber);
  }
}
