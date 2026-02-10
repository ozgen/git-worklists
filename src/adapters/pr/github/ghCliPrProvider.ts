import * as cp from "child_process";
import { PrProviderPort } from "../../../core/pr/ports/prProviderPort";
import { PullRequest } from "../../../core/pr/model/pullRequest";
import { PullRequestDetails } from "../../../core/pr/model/pullRequestDetails";
import { ReviewAction } from "../../../core/pr/model/reviewAction";

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

    // GitHub API: PR review comment (inline)
    // Uses `line` + `side=RIGHT` (new file side)
    await execGh(
      [
        "api",
        "-X",
        "POST",
        `repos/${repo}/pulls/${prNumber}/comments`,
        "-f",
        `body=${msg}`,
        "-f",
        `commit_id=${sha}`,
        "-f",
        `path=${p}`,
        "-f",
        "side=RIGHT",
        "-F",
        `line=${line}`,
      ],
      repoRoot,
    );
  }
}
