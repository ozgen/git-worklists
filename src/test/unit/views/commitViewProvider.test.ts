import * as fs from "node:fs/promises";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeMock = vi.hoisted(() => {
  class Uri {
    constructor(public readonly fsPath: string) {}
    static file(p: string) {
      return new Uri(p);
    }
    static joinPath(base: Uri, ...paths: string[]) {
      const joined = [base.fsPath, ...paths].join("/").replace(/\/+/g, "/");
      return new Uri(joined);
    }
  }

  const workspace = {
    fs: {
      readFile: vi.fn(async (_uri: any) => new Uint8Array()),
    },
  };

  const commands = {
    executeCommand: vi.fn(async (_cmd: string) => undefined),
  };

  return { Uri, workspace, commands };
});

vi.mock("vscode", () => vscodeMock);

import * as vscode from "vscode";
import { CommitViewProvider } from "../../../views/commitViewProvider";

type ReceiveHandler = (msg: any) => any;

function makeWebview() {
  const postMessage = vi.fn(async (_msg: any) => true);
  let receiveHandler: ReceiveHandler | undefined;

  const webview: any = {
    options: {},
    html: "",
    cspSource: "vscode-resource://csp",
    postMessage,

    asWebviewUri: (uri: any) => `webview:${uri.fsPath}`,

    onDidReceiveMessage: (cb: ReceiveHandler) => {
      receiveHandler = cb;
      return { dispose() {} };
    },
    __emitReceive: async (msg: any) => {
      if (!receiveHandler) {
        throw new Error("receive handler not registered");
      }
      return await receiveHandler(msg);
    },
  };

  return webview;
}

function makeWebviewView(webview: any) {
  return { webview } as any;
}

describe("CommitViewProvider (unit)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const templatePath = path.resolve(
      __dirname,
      "../../../../media/commit/commitView.html",
    );
    const buf = await fs.readFile(templatePath);

    (vscode as any).workspace.fs.readFile.mockImplementation(
      async (_uri: any) => buf,
    );
  });

  it("sets webview options and html, and posts initial state", async () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    await provider.resolveWebviewView(makeWebviewView(webview));

    expect(webview.options).toEqual({
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(vscode.Uri.file("/ext") as any, "media"),
      ],
    });

    expect(typeof webview.html).toBe("string");
    expect(webview.html).toContain("<!doctype html>");
    expect(webview.html).toContain("acquireVsCodeApi()");
    expect(webview.html).toContain('id="btnCommit"');

    expect(webview.html).toContain("vscode.getState()");
    expect(webview.html).toContain("vscode.setState");

    expect(webview.html).toContain("style-src vscode-resource://csp;");
    expect(webview.html).toContain("script-src 'nonce-");

    expect(webview.html).toContain(
      '<link rel="stylesheet" href="webview:/ext/media/commit/commitView.css" />',
    );

    expect((vscode as any).workspace.fs.readFile).toHaveBeenCalledTimes(1);

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: { stagedCount: 0, conventionalCommitsAvailable: false },
    });
  });

  it("updateState posts merged state to webview", async () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    await provider.resolveWebviewView(makeWebviewView(webview));

    webview.postMessage.mockClear();

    provider.updateState({ stagedCount: 3 });
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: { stagedCount: 3, conventionalCommitsAvailable: false },
    });

    provider.updateState({ lastError: "oops" });
    expect(webview.postMessage).toHaveBeenLastCalledWith({
      type: "state",
      state: {
        stagedCount: 3,
        conventionalCommitsAvailable: false,
        lastError: "oops",
      },
    });

    provider.updateState({ conventionalCommitsAvailable: true });
    expect(webview.postMessage).toHaveBeenLastCalledWith({
      type: "state",
      state: {
        stagedCount: 3,
        conventionalCommitsAvailable: true,
        lastError: "oops",
      },
    });
  });

  it("on notify(no-staged) sets lastError and posts state (does not call onCommit)", async () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    await provider.resolveWebviewView(makeWebviewView(webview));

    webview.postMessage.mockClear();

    await webview.__emitReceive({ type: "notify", kind: "no-staged" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: {
        stagedCount: 0,
        conventionalCommitsAvailable: false,
        lastError: "No staged files.",
      },
    });
  });

  it("on 'commit' message calls onCommit and clears error (does not clear message)", async () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    await provider.resolveWebviewView(makeWebviewView(webview));

    provider.updateState({ lastError: "prev" });
    webview.postMessage.mockClear();

    await webview.__emitReceive({
      type: "commit",
      message: "  hello  ",
      amend: 1,
      push: "true",
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({
      message: "hello",
      amend: true,
      push: true,
    });

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: {
        stagedCount: 0,
        conventionalCommitsAvailable: false,
        lastError: undefined,
      },
    });

    const calls = webview.postMessage.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((m: any) => m?.type === "clearMessage")).toBe(false);
  });

  it("when onCommit throws, it posts state with lastError", async () => {
    const onCommit = vi.fn(async () => {
      throw new Error("boom");
    });

    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    await provider.resolveWebviewView(makeWebviewView(webview));

    webview.postMessage.mockClear();

    await webview.__emitReceive({
      type: "commit",
      message: "msg",
      amend: false,
      push: false,
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: {
        stagedCount: 0,
        conventionalCommitsAvailable: false,
        lastError: "boom",
      },
    });
  });

  it("ignores unknown messages", async () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    await provider.resolveWebviewView(makeWebviewView(webview));

    webview.postMessage.mockClear();

    await webview.__emitReceive({ type: "noop" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(webview.postMessage).not.toHaveBeenCalled();
  });

  it("conventionalCommit: when unavailable, posts error and does not call callback", async () => {
    const onCommit = vi.fn(async () => {});
    const onConventionalCommit = vi.fn(async () => "feat: x");

    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
      onConventionalCommit,
    );

    const webview = makeWebview();
    await provider.resolveWebviewView(makeWebviewView(webview));

    webview.postMessage.mockClear();

    await webview.__emitReceive({ type: "conventionalCommit" });

    expect(onConventionalCommit).not.toHaveBeenCalled();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: {
        stagedCount: 0,
        conventionalCommitsAvailable: false,
        lastError:
          "Conventional Commits extension is not installed or is disabled.",
      },
    });
  });

  it("conventionalCommit: when available, sets message and triggers focus commands", async () => {
    vi.useFakeTimers();

    const onCommit = vi.fn(async () => {});
    const onConventionalCommit = vi.fn(async () => "docs: hello");

    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
      onConventionalCommit,
    );

    const webview = makeWebview();
    await provider.resolveWebviewView(makeWebviewView(webview));

    provider.updateState({ conventionalCommitsAvailable: true });

    webview.postMessage.mockClear();
    (vscode as any).commands.executeCommand.mockClear();

    await webview.__emitReceive({ type: "conventionalCommit" });

    const posted = webview.postMessage.mock.calls.map((c: any[]) => c[0]);
    expect(
      posted.some(
        (m: any) =>
          m?.type === "ui" &&
          m?.action === "setMessage" &&
          m?.value === "docs: hello",
      ),
    ).toBe(true);

    await vi.runAllTimersAsync();

    expect((vscode as any).commands.executeCommand).toHaveBeenCalled();
    const focusCmd = "gitWorklists.commitPanel.focus";
    const focusCalls = (
      vscode as any
    ).commands.executeCommand.mock.calls.filter(
      (c: any[]) => c[0] === focusCmd,
    );
    expect(focusCalls.length).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it("setMessage/setAmend before view is resolved does not throw (postUi guard)", async () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    expect(() => provider.setMessage("hello")).not.toThrow();
    expect(() => provider.setAmend(true)).not.toThrow();
  });

  it("updateState before view is resolved does not throw (postState guard)", async () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    expect(() => provider.updateState({ stagedCount: 99 })).not.toThrow();
    expect(() => provider.updateState({ lastError: "x" })).not.toThrow();
  });

  it("on 'ready' message posts state again", async () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    await provider.resolveWebviewView(makeWebviewView(webview));

    provider.updateState({ stagedCount: 7 });
    webview.postMessage.mockClear();

    await webview.__emitReceive({ type: "ready" });

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: { stagedCount: 7, conventionalCommitsAvailable: false },
    });
  });
});
