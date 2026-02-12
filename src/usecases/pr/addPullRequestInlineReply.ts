import { PrProviderPort } from "../../core/pr/ports/prProviderPort";

export class AddPullRequestInlineReply {
    constructor(private readonly pr: PrProviderPort) {}
  
    run(repoRoot: string, prNumber: number, inReplyTo: number, body: string) {
      return this.pr.replyToInlineComment(repoRoot, prNumber, inReplyTo, body);
    }
  }
  