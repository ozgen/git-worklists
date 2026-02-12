import { PrProviderPort } from "../../core/pr/ports/prProviderPort";

export class AddPullRequestInlineComment {
  constructor(private readonly pr: PrProviderPort) {}

  run(
    repoRoot: string,
    prNumber: number,
    path: string,
    position: number,
    body: string,
    side: "LEFT" | "RIGHT",
  ) {
    const msg = body.trim();
    if (!msg) {
      throw new Error("Comment is empty.");
    }
    if (!path) {
      throw new Error("File path is empty.");
    }
    if (!Number.isFinite(position) || position <= 0) {
      throw new Error("Invalid diff position.");
    }
    return this.pr.addInlineComment(
      repoRoot,
      prNumber,
      path,
      position,
      msg,
      side,
    );
  }
}
