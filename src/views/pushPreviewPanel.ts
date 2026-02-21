import * as vscode from "vscode";
import { Deps } from "../app/types";
import { GitShowContentProvider } from "../adapters/vscode/gitShowContentProvider";
import { normalizeRepoRelPath } from "../utils/paths";

type PushPreviewResult = "push" | "cancel";

export async function openPushPreviewPanel(
  deps: Deps,
  opts: {
    repoRoot: string;
    forceWithLease: boolean;
  },
): Promise<PushPreviewResult> {
  const upstreamRef = await deps.git.tryGetUpstreamRef(opts.repoRoot);
  const commits = await deps.git.listOutgoingCommits(opts.repoRoot);

  const upstreamLabel = upstreamRef ?? "(no upstream – will set on push)";

  if (commits.length === 0) {
    await vscode.window.showInformationMessage(
      upstreamRef
        ? `Nothing to push (already up to date with ${upstreamRef}).`
        : "Nothing to push (no local-only commits found).",
    );
    return "cancel";
  }

  const extensionUri = deps.context.extensionUri;

  const panel = vscode.window.createWebviewPanel(
    "gitWorklists.pushPreview",
    upstreamRef
      ? `Push Commits to ${upstreamRef}`
      : "Push Preview (Set Upstream)",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
    } as any,
  );

  const nonce = String(Date.now());
  const post = (msg: any) => panel.webview.postMessage(msg);

  panel.webview.html = await renderPushPreviewHtml(
    panel.webview,
    extensionUri,
    {
      nonce,
      upstreamRef: upstreamLabel,
      commits: commits.map((c) => ({
        hash: c.hash,
        shortHash: c.shortHash,
        subject: c.subject,
        authorName: c.authorName ?? "",
        authorDateIso: c.authorDateIso ?? "",
      })),
      forceWithLease: opts.forceWithLease,
    },
  );

  // Default selection: first commit => preload files
  const first = commits[0];
  if (first) {
    const files = await deps.git.getCommitFiles(opts.repoRoot, first.hash);
    post({ type: "commitFiles", commitHash: first.hash, files });
  }

  return await new Promise<PushPreviewResult>((resolve) => {
    let settled = false;

    const settle = (r: PushPreviewResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(r);
      try {
        panel.dispose();
      } catch {}
    };

    panel.onDidDispose(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve("cancel");
    });

    panel.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (!msg || typeof msg.type !== "string") {
          return;
        }

        if (msg.type === "selectCommit") {
          const hash = String(msg.hash ?? "");
          if (!hash) {
            return;
          }

          const files = await deps.git.getCommitFiles(opts.repoRoot, hash);
          post({ type: "commitFiles", commitHash: hash, files });
          return;
        }

        if (msg.type === "openDiff") {
          const hash = String(msg.hash ?? "");
          const repoRel = String(msg.path ?? "");
          const statusRaw = String(msg.status ?? "");
          const oldRepoRel = String(msg.oldPath ?? "");

          if (!hash || !repoRel) {
            return;
          }

          const p = normalizeRepoRelPath(repoRel);
          const oldP = oldRepoRel ? normalizeRepoRelPath(oldRepoRel) : "";

          const isAdded = statusRaw.toUpperCase().startsWith("A");
          const isRenamed = statusRaw.toUpperCase().startsWith("R") && !!oldP;

          const leftRef = isAdded ? "EMPTY" : `${hash}^`;
          const rightRef = `${hash}`;
          const leftPath = isRenamed ? oldP : p;

          const leftUri = vscode.Uri.parse(
            `${GitShowContentProvider.scheme}:/${encodeURIComponent(leftRef)}/${encodeURIComponent(leftPath)}`,
          );
          const rightUri = vscode.Uri.parse(
            `${GitShowContentProvider.scheme}:/${encodeURIComponent(rightRef)}/${encodeURIComponent(p)}`,
          );

          await vscode.commands.executeCommand(
            "vscode.diff",
            leftUri,
            rightUri,
            `${p} (${hash.slice(0, 7)})`,
          );
          return;
        }

        if (msg.type === "push") {
          return settle("push");
        }
        if (msg.type === "cancel") {
          return settle("cancel");
        }
      } catch (e) {
        console.error(e);
        void vscode.window.showErrorMessage(
          "Git Worklists: push preview panel error (see console)",
        );
      }
    });
  });
}

async function renderPushPreviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  args: {
    nonce: string;
    upstreamRef: string;
    commits: {
      hash: string;
      shortHash: string;
      subject: string;
      authorName: string;
      authorDateIso: string;
    }[];
    forceWithLease: boolean;
  },
): Promise<string> {
  const htmlUri = vscode.Uri.joinPath(
    extensionUri,
    "media",
    "pushPreview",
    "pushPreview.html",
  );
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      "media",
      "pushPreview",
      "pushPreview.css",
    ),
  );

  const raw = await vscode.workspace.fs.readFile(htmlUri);
  const template = new TextDecoder("utf-8").decode(raw);

  const dataJson = JSON.stringify({
    upstreamRef: args.upstreamRef,
    commits: args.commits,
    forceWithLease: args.forceWithLease,
  });

  const pushLabel = args.forceWithLease ? "Push (force-with-lease)" : "Push";

  return template
    .replaceAll("{{nonce}}", escapeHtml(args.nonce))
    .replaceAll("{{cspSource}}", webview.cspSource)
    .replaceAll("{{cssUri}}", String(cssUri))
    .replaceAll("{{upstreamRef}}", escapeHtml(args.upstreamRef))
    .replaceAll("{{pushLabel}}", escapeHtml(pushLabel))
    .replaceAll("{{dataJson}}", dataJson);
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
