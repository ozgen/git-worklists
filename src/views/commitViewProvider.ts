import * as vscode from "vscode";

export type CommitViewState = {
  stagedCount: number;
  conventionalCommitsAvailable: boolean;
  lastError?: string;
};

type UiMessage =
  | { type: "state"; state: CommitViewState }
  | { type: "ui"; action: "setAmend"; value: boolean }
  | { type: "ui"; action: "setMessage"; value: string }
  | { type: "ui"; action: "focusMessage"; value: boolean };

export class CommitViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "gitWorklists.commitPanel";

  private view?: vscode.WebviewView;
  private state: CommitViewState = {
    stagedCount: 0,
    conventionalCommitsAvailable: false,
  };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onCommit: (args: {
      message: string;
      amend: boolean;
      push: boolean;
    }) => Promise<void>,
    private readonly onConventionalCommit?: () => Promise<string | null>,
  ) {}

  async resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;

    // Allow webview to load only from /media
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, "media");

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot],
    };

    view.webview.html = await this.renderHtml(view.webview);

    view.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg?.type === "ready") {
          this.postState();
          return;
        }

        if (msg?.type === "notify" && msg?.kind === "no-staged") {
          this.state.lastError = "No staged files.";
          this.postState();
          return;
        }

        if (msg?.type === "conventionalCommit") {
          if (
            !this.state.conventionalCommitsAvailable ||
            !this.onConventionalCommit
          ) {
            this.state.lastError =
              "Conventional Commits extension is not installed or is disabled.";
            this.postState();
            return;
          }

          const generated = await this.onConventionalCommit();

          if (generated && generated.trim()) {
            this.setMessage(generated.trim());
            this.state.lastError = undefined;
          }

          this.postState();

          const focusCmd = `${CommitViewProvider.viewId}.focus`;
          const delays = [0, 120, 300, 600, 1000];

          for (const d of delays) {
            setTimeout(() => {
              void vscode.commands.executeCommand(focusCmd);
              this.postUi({
                type: "ui",
                action: "focusMessage",
                value: true,
              });
            }, d);
          }

          return;
        }

        if (msg?.type === "commit") {
          const message = String(msg.message ?? "").trim();
          const amend = Boolean(msg.amend);
          const push = Boolean(msg.push);

          await this.onCommit({ message, amend, push });

          this.state.lastError = undefined;
          this.postState();

          this.setAmend(false);
        }
      } catch (e: any) {
        this.state.lastError = e?.message ?? String(e);
        this.postState();
      }
    });

    this.postState();
  }

  updateState(next: Partial<CommitViewState>) {
    this.state = { ...this.state, ...next };
    this.postState();
  }

  setAmend(value: boolean) {
    this.postUi({ type: "ui", action: "setAmend", value });
  }

  setMessage(value: string) {
    this.postUi({ type: "ui", action: "setMessage", value });
  }

  private postUi(msg: UiMessage) {
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage(msg);
  }

  private postState() {
    if (!this.view) {
      return;
    }
    const msg: UiMessage = { type: "state", state: this.state };
    this.view.webview.postMessage(msg);
  }

  private async renderHtml(webview: vscode.Webview): Promise<string> {
    const nonce = String(Date.now());

    const htmlUri = vscode.Uri.joinPath(
      this.extensionUri,
      "media",
      "commit",
      "commitView.html",
    );

    const cssWebviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "media",
        "commit",
        "commitView.css",
      ),
    );

    const raw = await vscode.workspace.fs.readFile(htmlUri);
    const template = new TextDecoder("utf-8").decode(raw);

    return template
      .replaceAll("{{nonce}}", nonce)
      .replaceAll("{{cspSource}}", webview.cspSource)
      .replaceAll("{{cssUri}}", String(cssWebviewUri));
  }
}
