export type PullRequest = {
  number: number;
  title: string;
  url: string;
  authorLogin?: string;
  isDraft?: boolean;
  updatedAt?: string;
};
