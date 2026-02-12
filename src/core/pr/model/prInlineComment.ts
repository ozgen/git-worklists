export type PrInlineComment = {
    id: number; // GitHub review comment database id
    inReplyTo?: number; // database id of parent comment (if reply)
  
    path: string;
    body: string;
    user: string;
    createdAt?: string;
  
    side: "LEFT" | "RIGHT";
    line: number; // 1-based
    isOutdated?: boolean;
  
    // thread-level info from GraphQL
    threadId?: string; // GitHub GraphQL reviewThread.id
    isResolved?: boolean;
  };
  