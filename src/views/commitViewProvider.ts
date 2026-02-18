import * as vscode from "vscode";

export type CommitViewState = {
  stagedCount: number;
  lastError?: string;
};

export class CommitViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "gitWorklists.commitPanel";

  private view?: vscode.WebviewView;
  private state: CommitViewState = { stagedCount: 0 };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onCommit: (args: {
      message: string;
      amend: boolean;
      push: boolean;
    }) => Promise<void>,
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    view.webview.html = this.renderHtml(view.webview);

    view.webview.onDidReceiveMessage(async (msg) => {
      try {

        if (msg?.type === "ready") {
          this.postState();
          return;
        }
        
        if (msg?.type === "notify" && msg?.kind === "no-staged") {
          this.state.lastError =
            "No staged files.";
          this.postState();
          return;
        }        

        if (msg?.type === "commit") {
          const message = String(msg.message ?? "").trim();
          const amend = Boolean(msg.amend);
          const push = Boolean(msg.push);

          await this.onCommit({ message, amend, push });

          // Clear error
          this.state.lastError = undefined;
          this.postState();

        }
      } catch (e: any) {
        this.state.lastError = e?.message ?? String(e);
        this.postState();
      }
    });

    // initial state
    this.postState();
  }

  updateState(next: Partial<CommitViewState>) {
    this.state = { ...this.state, ...next };
    this.postState();
  }

  private postState() {
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage({ type: "state", state: this.state });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = String(Date.now());

    return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src ${webview.cspSource} https:;
                 style-src 'unsafe-inline';
                 script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Commit</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 10px;
    }
    .muted {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    textarea {
      width: 100%;
      min-height: 90px;
      resize: vertical;
      box-sizing: border-box;
      padding: 8px;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      outline: none;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }
    .spacer { flex: 1; }
    button {
      border: 1px solid var(--vscode-button-border, transparent);
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    button:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border-color: var(--vscode-button-secondaryBorder, transparent);
    }
    .error {
      margin-top: 10px;
      color: var(--vscode-errorForeground);
      white-space: pre-wrap;
      font-size: 12px;
    }
    .footer {
      margin-top: 12px;
      display: flex;
      gap: 8px;
    }
    .footer button { flex: 1; }
  </style>
</head>
<body>
  <div class="muted" id="stagedLabel">Staged: 0</div>

  <div style="margin-top: 8px;">
    <textarea id="message" placeholder="Commit Message"></textarea>
  </div>

  <div class="row">
    <label class="row" style="gap: 6px; margin: 0;">
      <input id="amend" type="checkbox" />
      <span>Amend</span>
    </label>
    <div class="spacer"></div>
  </div>

  <div class="footer">
    <button class="primary" id="btnCommit">Commit</button>
    <button class="secondary" id="btnCommitPush">Commit & Push</button>
  </div>

  <div class="error" id="error"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const stagedLabel = document.getElementById("stagedLabel");
    const messageEl = document.getElementById("message");
    const amendEl = document.getElementById("amend");
    const errorEl = document.getElementById("error");
    const btnCommit = document.getElementById("btnCommit");
    const btnCommitPush = document.getElementById("btnCommitPush");

    // Track staged count locally (for click guard)
    let stagedCount = 0;

    // Restore draft from webview state
    const persisted = vscode.getState() || {};
    if (typeof persisted.message === "string") {
      messageEl.value = persisted.message;
    }
    if (typeof persisted.amend === "boolean") {
      amendEl.checked = persisted.amend;
    }

    function persist() {
      const current = vscode.getState() || {};
      vscode.setState({
        ...current,
        message: messageEl.value,
        amend: amendEl.checked,
      });
    }

    messageEl.addEventListener("input", persist);
    amendEl.addEventListener("change", persist);

    function sendCommit(push) {
      vscode.postMessage({
        type: "commit",
        message: messageEl.value,
        amend: amendEl.checked,
        push
      });
    }

    function tryCommit(push) {
      const isAmend = Boolean(amendEl.checked);
    
      if ((stagedCount ?? 0) === 0) {
        if (isAmend) {
          sendCommit(push);
          return;
        }
    
        if (push) {
          sendCommit(true);
          return;
        }
    
        // otherwise: normal commit needs staged files
        vscode.postMessage({ type: "notify", kind: "no-staged" });
        return;
      }
    
      sendCommit(push);
    }    

    btnCommit.addEventListener("click", () => tryCommit(false));
    btnCommitPush.addEventListener("click", () => tryCommit(true));

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg?.type === "state") {
        const s = msg.state || {};
        stagedCount = s.stagedCount ?? 0;

        stagedLabel.textContent = "Staged: " + stagedCount;
        errorEl.textContent = s.lastError ? String(s.lastError) : "";

        btnCommit.disabled = false;
        btnCommitPush.disabled = false;
      }
    });
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
  }
}
