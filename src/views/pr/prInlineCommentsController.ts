import * as vscode from "vscode";
import { PrInlineComment } from "../../core/pr/model/prInlineComment";

export type ThreadMeta = {
  prNumber: number;
  path: string;
  line: number; // 1-based line (GitHub)
  leftUri: vscode.Uri;
  rightUri: vscode.Uri;

  rootCommentId: number; // REST database id, used for in_reply_to
  threadId?: string; // GraphQL reviewThread id, used for resolve/unresolve
};

export class PrInlineCommentsController implements vscode.Disposable {
  readonly controller: vscode.CommentController;

  private readonly threads: vscode.CommentThread[] = [];
  private readonly metaByThread = new WeakMap<
    vscode.CommentThread,
    ThreadMeta
  >();

  private activeThread?: vscode.CommentThread;

  constructor() {
    this.controller = vscode.comments.createCommentController(
      "gitWorklists.prInlineComments",
      "Git Worklists PR Inline Comments",
    );

    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (doc) => [
        new vscode.Range(0, 0, Math.max(0, doc.lineCount - 1), 0),
      ],
    };
  }

  dispose() {
    this.clear();
    this.controller.dispose();
  }

  clear() {
    this.activeThread = undefined;

    for (const t of this.threads) {
      try {
        t.dispose();
      } catch {
        // ignore
      }
    }
    this.threads.length = 0;
  }

  getMeta(thread: vscode.CommentThread): ThreadMeta | undefined {
    return this.metaByThread.get(thread);
  }

  setActiveThread(thread: vscode.CommentThread | undefined) {
    this.activeThread = thread;
  }

  getActiveThread(): vscode.CommentThread | undefined {
    return this.activeThread;
  }

  renderForDiff(
    leftUri: vscode.Uri,
    rightUri: vscode.Uri,
    filePath: string,
    comments: PrInlineComment[],
    prNumber: number,
  ) {
    this.clear();

    const relevant = comments.filter((c) => c.path === filePath);
    if (relevant.length === 0) {
      return;
    }

    const byId = new Map<number, PrInlineComment>();
    for (const c of relevant) {
      byId.set(c.id, c);
    }

    const rootIdOf = (c: PrInlineComment): number => {
      let cur: PrInlineComment | undefined = c;
      const guard = new Set<number>();

      while (cur?.inReplyTo) {
        if (guard.has(cur.id)) {
          break;
        }
        guard.add(cur.id);

        const parent = byId.get(cur.inReplyTo);
        if (!parent) {
          break;
        }
        cur = parent;
      }
      return cur?.id ?? c.id;
    };

    const groups = new Map<number, PrInlineComment[]>();
    for (const c of relevant) {
      const rootId = rootIdOf(c);
      const arr = groups.get(rootId) ?? [];
      arr.push(c);
      groups.set(rootId, arr);
    }

    for (const [rootId, group] of groups) {
      group.sort((a, b) => {
        if (a.id === rootId) {
          return -1;
        }
        if (b.id === rootId) {
          return 1;
        }

        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        if (ta !== tb) {
          return ta - tb;
        }

        return a.id - b.id;
      });

      const root = byId.get(rootId) ?? group[0];

      const targetUri = root.side === "LEFT" ? leftUri : rightUri;
      const line = Math.max(1, root.line || 1);
      const line0 = Math.max(0, line - 1);
      const range = new vscode.Range(line0, 0, line0, 0);

      const vsComments: vscode.Comment[] = group.map((c) => {
        const md = new vscode.MarkdownString(
          `**@${c.user}**${c.isOutdated ? " _(outdated)_" : ""}\n\n${c.body}`,
        );
        md.isTrusted = false;

        return {
          body: md,
          mode: vscode.CommentMode.Preview,
          author: { name: c.user },
        };
      });

      const thread = this.controller.createCommentThread(
        targetUri,
        range,
        vsComments,
      );

      thread.contextValue = "gitWorklists.prThread";
      thread.canReply = false;

      thread.state = root.isResolved
        ? vscode.CommentThreadState.Resolved
        : vscode.CommentThreadState.Unresolved;

      this.metaByThread.set(thread, {
        prNumber,
        path: filePath,
        line,
        leftUri,
        rightUri,
        rootCommentId: rootId,
        threadId: root.threadId,
      });

      this.threads.push(thread);
    }
  }
}
