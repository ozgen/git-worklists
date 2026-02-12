import * as cp from "child_process";
import { PrProviderPort } from "../../../core/pr/ports/prProviderPort";
import { PullRequest } from "../../../core/pr/model/pullRequest";
import { PullRequestDetails } from "../../../core/pr/model/pullRequestDetails";
import { ReviewAction } from "../../../core/pr/model/reviewAction";
import { PrInlineComment } from "../../../core/pr/model/prInlineComment";

function execGhJson(args: string[], cwd: string): Promise<any> {
  return new Promise((resolve, reject) => {
    cp.execFile(
      "gh",
      args,
      { cwd, encoding: "utf8" },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(
              `gh ${args.join(" ")} failed: ${(stderr || err.message).trim()}`,
            ),
          );
          return;
        }
        try {
          resolve(JSON.parse(stdout || "null"));
        } catch {
          reject(new Error("Failed to parse gh JSON output."));
        }
      },
    );
  });
}

function execGh(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cp.execFile(
      "gh",
      args,
      { cwd, encoding: "utf8" },
      (err, _stdout, stderr) => {
        if (err) {
          reject(
            new Error(
              `gh ${args.join(" ")} failed: ${(stderr || err.message).trim()}`,
            ),
          );
          return;
        }
        resolve();
      },
    );
  });
}

async function getRepoSlug(repoRoot: string): Promise<string> {
  // "owner/name"
  const x = await execGhJson(
    ["repo", "view", "--json", "nameWithOwner"],
    repoRoot,
  );
  const slug = String(x?.nameWithOwner ?? "").trim();
  if (!slug.includes("/")) {
    throw new Error("Cannot determine GitHub repo (gh repo view failed).");
  }
  return slug;
}

async function getPrHeadSha(
  repoRoot: string,
  prNumber: number,
): Promise<string> {
  // The head commit SHA GitHub expects for inline review comments
  const x = await execGhJson(
    ["pr", "view", String(prNumber), "--json", "headRefOid"],
    repoRoot,
  );
  const sha = String(x?.headRefOid ?? "").trim();
  if (!sha) {
    throw new Error("Cannot determine PR head SHA.");
  }
  return sha;
}

function runGhCapture(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn("gh", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    child.on("error", reject);
    child.on("close", (code: number) => {
      if (code === 0) {
        return resolve(out);
      }
      reject(
        new Error(
          `gh ${args.join(" ")} failed (code ${code}):\n${(err + "\n" + out).trim()}`,
        ),
      );
    });
  });
}

async function getRepoNameWithOwner(repoRoot: string): Promise<string> {
  // uses GH CLI’s repo context
  const out = await runGhCapture(repoRoot, [
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);
  return out.trim();
}

async function getPrNodeId(
  repoRoot: string,
  prNumber: number,
): Promise<string> {
  // gh returns PR node id as "id" (GraphQL node id)
  const x = await execGhJson(
    ["pr", "view", String(prNumber), "--json", "id"],
    repoRoot,
  );
  const id = String(x?.id ?? "").trim();
  if (!id) {
    throw new Error("Cannot determine PR node id.");
  }
  return id;
}

type ReviewThreadInfo = {
  threadId: string;
  isResolved: boolean;
  commentDatabaseIds: number[];
};

async function listReviewThreads(
  repoRoot: string,
  prNumber: number,
): Promise<ReviewThreadInfo[]> {
  const prId = await getPrNodeId(repoRoot, prNumber);

  const raw = await runGhCapture(repoRoot, [
    "api",
    "graphql",
    "-f",
    `query=query($pr:ID!) {
      node(id:$pr) {
        ... on PullRequest {
          reviewThreads(first:100) {
            nodes {
              id
              isResolved
              comments(first:100) { nodes { databaseId } }
            }
          }
        }
      }
    }`,
    "-f",
    `pr=${prId}`,
  ]);

  const json = JSON.parse(raw);
  const nodes = json?.data?.node?.reviewThreads?.nodes ?? [];
  const arr = Array.isArray(nodes) ? nodes : [];

  return arr.map((t: any) => ({
    threadId: String(t?.id ?? ""),
    isResolved: Boolean(t?.isResolved),
    commentDatabaseIds: (t?.comments?.nodes ?? [])
      .map((c: any) => Number(c?.databaseId))
      .filter((n: any) => Number.isFinite(n) && n > 0),
  }));
}

export class GhCliPrProvider implements PrProviderPort {
  kind: "github" = "github";

  async listOpen(repoRoot: string): Promise<PullRequest[]> {
    const data = await execGhJson(
      [
        "pr",
        "list",
        "--state",
        "open",
        "--json",
        "number,title,url,updatedAt,isDraft,author",
      ],
      repoRoot,
    );

    const arr = Array.isArray(data) ? data : [];
    return arr.map((x: any) => ({
      number: Number(x.number),
      title: String(x.title ?? ""),
      url: String(x.url ?? ""),
      updatedAt: x.updatedAt ? String(x.updatedAt) : undefined,
      isDraft: Boolean(x.isDraft),
      authorLogin: x.author?.login ? String(x.author.login) : undefined,
    }));
  }

  async getDetails(
    repoRoot: string,
    prNumber: number,
  ): Promise<PullRequestDetails> {
    const x = await execGhJson(
      [
        "pr",
        "view",
        String(prNumber),
        "--json",
        "number,title,url,body,author,comments,reviews,files,baseRefName",
      ],
      repoRoot,
    );

    const comments = Array.isArray(x?.comments) ? x.comments : [];
    const reviews = Array.isArray(x?.reviews) ? x.reviews : [];
    const files = Array.isArray(x?.files) ? x.files : [];

    return {
      number: Number(x.number),
      title: String(x.title ?? ""),
      url: String(x.url ?? ""),
      body: x.body ? String(x.body) : undefined,
      authorLogin: x.author?.login ? String(x.author.login) : undefined,
      comments: comments.map((c: any) => ({
        authorLogin: c?.author?.login ? String(c.author.login) : undefined,
        body: String(c?.body ?? ""),
        createdAt: c?.createdAt ? String(c.createdAt) : undefined,
      })),
      reviews: reviews.map((r: any) => ({
        authorLogin: r?.author?.login ? String(r.author.login) : undefined,
        state: r?.state ? String(r.state) : undefined,
        body: r?.body ? String(r.body) : undefined,
        submittedAt: r?.submittedAt ? String(r.submittedAt) : undefined,
      })),
      files: files.map((f: any) => ({
        path: String(f?.path ?? ""),
        additions: typeof f?.additions === "number" ? f.additions : undefined,
        deletions: typeof f?.deletions === "number" ? f.deletions : undefined,
      })),
    };
  }

  async addComment(
    repoRoot: string,
    prNumber: number,
    body: string,
  ): Promise<void> {
    await execGh(["pr", "comment", String(prNumber), "-b", body], repoRoot);
  }

  async submitReview(
    repoRoot: string,
    prNumber: number,
    action: ReviewAction,
    body?: string,
  ): Promise<void> {
    const msg = (body ?? "").trim();

    if (action === "approve") {
      await execGh(
        [
          "pr",
          "review",
          String(prNumber),
          "--approve",
          ...(msg ? ["-b", msg] : []),
        ],
        repoRoot,
      );
      return;
    }

    if (action === "requestChanges") {
      const final = msg || "Requesting changes.";
      await execGh(
        ["pr", "review", String(prNumber), "--request-changes", "-b", final],
        repoRoot,
      );
      return;
    }

    if (!msg) {
      throw new Error("Comment body is empty.");
    }
    await execGh(
      ["pr", "review", String(prNumber), "--comment", "-b", msg],
      repoRoot,
    );
  }

  /**
   * Add an inline review comment on the RIGHT side of the PR diff.
   * NOTE: GitHub will reject this if the line isn't part of the PR diff.
   */
  async addInlineComment(
    repoRoot: string,
    prNumber: number,
    path: string,
    line: number,
    body: string,
    side: "LEFT" | "RIGHT",
  ): Promise<void> {
    const p = String(path ?? "").trim();
    const msg = String(body ?? "").trim();

    if (!p) {
      throw new Error("File path is empty.");
    }
    if (!msg) {
      throw new Error("Comment is empty.");
    }
    if (!Number.isFinite(line) || line <= 0) {
      throw new Error("Invalid line number.");
    }

    const repo = await getRepoSlug(repoRoot);
    const sha = await getPrHeadSha(repoRoot, prNumber);

    await execGh(
      [
        "api",
        "-X",
        "POST",
        `repos/${repo}/pulls/${prNumber}/comments`,
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "X-GitHub-Api-Version: 2022-11-28",
        "-f",
        `body=${msg}`,
        "-f",
        `commit_id=${sha}`,
        "-f",
        `path=${p}`,
        "-f",
        `side=${side}`,
        "-F",
        `line=${line}`,
      ],
      repoRoot,
    );
  }

  async listInlineReviewComments(
    repoRoot: string,
    prNumber: number,
  ): Promise<PrInlineComment[]> {
    const nameWithOwner = await getRepoNameWithOwner(repoRoot);

    const raw = await runGhCapture(repoRoot, [
      "api",
      `repos/${nameWithOwner}/pulls/${prNumber}/comments`,
    ]);

    const arr = JSON.parse(raw) as any[];
    const base: PrInlineComment[] = (Array.isArray(arr) ? arr : [])
      .map((c) => {
        const side = (c.side === "LEFT" ? "LEFT" : "RIGHT") as "LEFT" | "RIGHT";
        const line =
          typeof c.line === "number"
            ? c.line
            : typeof c.original_line === "number"
              ? c.original_line
              : 1;

        return {
          id: Number(c.id),
          inReplyTo:
            typeof c.in_reply_to === "number" ? c.in_reply_to : undefined,
          path: String(c.path ?? ""),
          body: String(c.body ?? ""),
          user: String(c.user?.login ?? "unknown"),
          createdAt:
            typeof c.created_at === "string" ? c.created_at : undefined,
          side,
          line,
          isOutdated: Boolean(c.position === null),
        } satisfies PrInlineComment;
      })
      .filter((x) => x.path);

    // merge thread info (threadId + isResolved)
    const threads = await listReviewThreads(repoRoot, prNumber);

    const byCommentId = new Map<
      number,
      { threadId: string; isResolved: boolean }
    >();
    for (const t of threads) {
      for (const cid of t.commentDatabaseIds) {
        byCommentId.set(cid, {
          threadId: t.threadId,
          isResolved: t.isResolved,
        });
      }
    }

    for (const c of base) {
      const hit = byCommentId.get(c.id);
      if (hit) {
        c.threadId = hit.threadId;
        c.isResolved = hit.isResolved;
      }
    }

    return base;
  }

  async replyToInlineComment(
    repoRoot: string,
    prNumber: number,
    commentId: number,
    body: string,
  ): Promise<void> {
    const msg = String(body ?? "").trim();
    if (!msg) {
      throw new Error("Reply is empty.");
    }
    if (!Number.isFinite(commentId) || commentId <= 0) {
      throw new Error("Invalid comment id.");
    }

    const repo = await getRepoSlug(repoRoot);

    await execGh(
      [
        "api",
        "-X",
        "POST",
        `repos/${repo}/pulls/${prNumber}/comments/${commentId}/replies`,
        "-f",
        `body=${msg}`,
      ],
      repoRoot,
    );
  }

  async setReviewThreadResolved(
    repoRoot: string,
    threadId: string,
    resolved: boolean,
  ): Promise<void> {
    const id = String(threadId ?? "").trim();
    if (!id) {
      throw new Error("Missing threadId.");
    }

    const mutationName = resolved
      ? "resolveReviewThread"
      : "unresolveReviewThread";

    await runGhCapture(repoRoot, [
      "api",
      "graphql",
      "-f",
      `query=mutation($id:ID!){
        ${mutationName}(input:{threadId:$id}) {
          thread { id isResolved }
        }
      }`,
      "-f",
      `id=${id}`,
    ]);
  }
}
