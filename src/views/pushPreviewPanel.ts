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

  const upstreamLabel =
  upstreamRef ?? "(no upstream – will set on push)";

  if (commits.length === 0) {
    await vscode.window.showInformationMessage(
      upstreamRef
        ? `Nothing to push (already up to date with ${upstreamRef}).`
        : "Nothing to push (no local-only commits found).",
    );
    return "cancel";
  }

  const panel = vscode.window.createWebviewPanel(
    "gitWorklists.pushPreview",
    upstreamRef ? `Push Commits to ${upstreamRef}` : "Push Preview (Set Upstream)",
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  const nonce = String(Date.now());

  const post = (msg: any) => panel.webview.postMessage(msg);

  const render = () => {
    panel.webview.html = getHtml({
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
    });
  };

  render();

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

          // IMPORTANT:
          // - A (added) => no left content
          // - also handle first-commit / missing parent by letting provider return ""
          const isAdded = statusRaw.toUpperCase().startsWith("A");
          const isRenamed = statusRaw.toUpperCase().startsWith("R") && !!oldP;

          // We'll use a special "EMPTY" ref for left side.
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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getHtml(args: {
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
}) {
  const data = {
    upstreamRef: args.upstreamRef,
    commits: args.commits,
    forceWithLease: args.forceWithLease,
  };

  return /* html */ `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${escapeHtml(args.nonce)}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Push Preview</title>
  <style>
    body { font-family: var(--vscode-font-family); margin: 0; padding: 0; }
    .bar {
      display:flex; align-items:center; justify-content:space-between;
      padding: 10px 12px; border-bottom: 1px solid var(--vscode-editorGroup-border);
    }
    .title { font-weight: 600; }
    .hint { opacity: 0.8; font-size: 12px; }
    .container { display: grid; grid-template-columns: 1fr 1fr; height: calc(100vh - 54px); }
    .pane { overflow: auto; border-right: 1px solid var(--vscode-editorGroup-border); }
    .pane:last-child { border-right: none; }
    .row {
      padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--vscode-editorGroup-border);
    }
    .row:hover { background: var(--vscode-list-hoverBackground); }
    .row.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .commitTop { display:flex; gap: 8px; align-items: baseline; }
    .hash { font-family: var(--vscode-editor-font-family); opacity: 0.9; }
    .subject { font-weight: 600; }
    .meta { opacity: 0.8; font-size: 12px; margin-top: 4px; }
    .fileLine { display:flex; gap: 10px; align-items:center; }
    .badge {
      width: 18px; text-align:center; font-family: var(--vscode-editor-font-family);
      opacity: 0.9;
    }
    .path { font-family: var(--vscode-editor-font-family); }
    .actions {
      display:flex; gap: 8px;
    }
    button {
      border: 1px solid var(--vscode-button-border, transparent);
      padding: 6px 10px; border-radius: 6px;
      cursor: pointer;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .secondary {
      background: transparent;
      color: var(--vscode-foreground);
      border-color: var(--vscode-editorGroup-border);
    }
  </style>
</head>
<body>
  <div class="bar">
    <div>
      <div class="title">Push Commits to ${escapeHtml(args.upstreamRef)}</div>
      <div class="hint">Click a commit to see its files. Click a file to open a diff.</div>
    </div>
    <div class="actions">
      <button class="secondary" id="cancelBtn">Cancel</button>
      <button class="primary" id="pushBtn">${args.forceWithLease ? "Push (force-with-lease)" : "Push"}</button>
    </div>
  </div>

  <div class="container">
    <div class="pane" id="commitsPane"></div>
    <div class="pane" id="filesPane"></div>
  </div>

  <script nonce="${escapeHtml(args.nonce)}">
    const vscode = acquireVsCodeApi();
    const state = {
      upstreamRef: ${JSON.stringify(data.upstreamRef)},
      forceWithLease: ${JSON.stringify(data.forceWithLease)},
      commits: ${JSON.stringify(data.commits)},
      selectedHash: ${JSON.stringify(data.commits[0]?.hash ?? "")},
      filesByCommit: new Map(),
    };

    const commitsPane = document.getElementById("commitsPane");
    const filesPane = document.getElementById("filesPane");

    function renderCommits() {
      commitsPane.innerHTML = "";
      for (const c of state.commits) {
        const el = document.createElement("div");
        el.className = "row" + (c.hash === state.selectedHash ? " active" : "");
        el.onclick = () => {
          state.selectedHash = c.hash;
          renderCommits();
          renderFiles();
          vscode.postMessage({ type: "selectCommit", hash: c.hash });
        };

        el.innerHTML = \`
          <div class="commitTop">
            <span class="hash">\${c.shortHash}</span>
            <span class="subject">\${escapeHtml(c.subject)}</span>
          </div>
          <div class="meta">\${escapeHtml(c.authorName)} \${escapeHtml(c.authorDateIso)}</div>
        \`;
        commitsPane.appendChild(el);
      }
    }

    function renderFiles() {
      filesPane.innerHTML = "";
      const hash = state.selectedHash;
      const files = state.filesByCommit.get(hash) || [];

      if (!hash) {
        filesPane.innerHTML = '<div class="row">No commit selected.</div>';
        return;
      }

      if (!files.length) {
        filesPane.innerHTML = '<div class="row">Loading files…</div>';
        return;
      }

      for (const f of files) {
        const el = document.createElement("div");
        el.className = "row";
        el.onclick = () => {
          vscode.postMessage({
            type: "openDiff",
            hash,
            path: f.path,
            status: f.status,
            oldPath: f.oldPath,
          });
        };

        const status = escapeHtml(f.status || "?");
        const p = escapeHtml(f.path || "");
        const oldP = f.oldPath ? escapeHtml(f.oldPath) : "";

        el.innerHTML = \`
          <div class="fileLine">
            <span class="badge">\${status}</span>
            <span class="path">\${p}</span>
          </div>
          \${oldP ? '<div class="meta">from ' + oldP + '</div>' : ''}
        \`;
        filesPane.appendChild(el);
      }
    }

    function escapeHtml(s) {
      return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === "commitFiles") {
        state.filesByCommit.set(msg.commitHash, msg.files || []);
        renderFiles();
      }
    });

    document.getElementById("pushBtn").onclick = () => vscode.postMessage({ type: "push" });
    document.getElementById("cancelBtn").onclick = () => vscode.postMessage({ type: "cancel" });

    renderCommits();
    renderFiles();
  </script>
</body>
</html>`;
}
