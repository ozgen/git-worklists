import { PrProviderPort } from "../../core/pr/ports/prProviderPort";

export class AddPullRequestComment {
  constructor(private readonly pr: PrProviderPort) {}
  run(repoRoot: string, prNumber: number, body: string): Promise<void> {
    const msg = body.trim();
    if (!msg) {
      throw new Error("Comment is empty.");
    }
    return this.pr.addComment(repoRoot, prNumber, msg);
  }
}
