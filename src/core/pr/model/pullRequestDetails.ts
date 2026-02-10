export type PullRequestComment = {
  authorLogin?: string;
  body: string;
  createdAt?: string;
};

export type PullRequestReview = {
  authorLogin?: string;
  state?: string; // APPROVED / CHANGES_REQUESTED / COMMENTED
  body?: string;
  submittedAt?: string;
};

export type PullRequestFile = {
    path: string;
    additions?: number;
    deletions?: number;
  };
  
  export type PullRequestDetails = {
    number: number;
    title: string;
    url: string;
    authorLogin?: string;
    body?: string;
  
    baseRefName?: string;
    files: PullRequestFile[];
  
    comments: PullRequestComment[];
    reviews: PullRequestReview[];
  };
  