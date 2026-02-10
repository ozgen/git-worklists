import { PullRequest } from "../model/pullRequest";
import { PullRequestDetails } from "../model/pullRequestDetails";
import { ReviewAction } from "../model/reviewAction";

export interface PrProviderPort {
  kind: "github" | "gitlab";
  listOpen(repoRoot: string): Promise<PullRequest[]>;
  getDetails(repoRoot: string, prNumber: number): Promise<PullRequestDetails>;
  addComment(repoRoot: string, prNumber: number, body: string): Promise<void>;
  submitReview(
    repoRoot: string,
    prNumber: number,
    action: ReviewAction,
    body?: string,
  ): Promise<void>;
  addInlineComment(
    repoRoot: string,
    prNumber: number,
    path: string,
    line: number,
    body: string,
  ): Promise<void>;
}
