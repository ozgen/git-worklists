import { PrProviderPort } from "../../core/pr/ports/prProviderPort";

export class AddPullRequestInlineComment {
  constructor(private readonly pr: PrProviderPort) {}

  run(
    repoRoot: string,
    prNumber: number,
    path: string,
    line: number,
    body: string,
  ): Promise<void> {
    const msg = body.trim();
    if (!msg) {
      throw new Error("Comment is empty.");
    }
    if (!path) {
      throw new Error("File path is empty.");
    }
    if (!Number.isFinite(line) || line <= 0) {
      throw new Error("Invalid line number.");
    }
    return this.pr.addInlineComment(repoRoot, prNumber, path, line, msg);
  }
}
