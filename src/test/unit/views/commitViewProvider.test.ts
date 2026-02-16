import { describe, it, expect, vi, beforeEach } from "vitest";

const vscodeMock = vi.hoisted(() => {
  class Uri {
    constructor(public readonly fsPath: string) {}
    static file(p: string) {
      return new Uri(p);
    }
  }

  return { Uri };
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets webview options and html, and posts initial state", () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    const view = makeWebviewView(webview);

    provider.resolveWebviewView(view);

    expect(webview.options).toEqual({
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file("/ext")],
    });

    expect(typeof webview.html).toBe("string");
    expect(webview.html).toContain("<!doctype html>");
    expect(webview.html).toContain("acquireVsCodeApi()");
    expect(webview.html).toContain('id="btnCommit"');
    expect(webview.html).toContain("acquireVsCodeApi()");

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: { stagedCount: 0 },
    });
  });

  it("updateState posts merged state to webview", () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    provider.resolveWebviewView(makeWebviewView(webview));

    webview.postMessage.mockClear();

    provider.updateState({ stagedCount: 3 });
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "state",
      state: { stagedCount: 3 },
    });

    provider.updateState({ lastError: "oops" });
    expect(webview.postMessage).toHaveBeenLastCalledWith({
      type: "state",
      state: { stagedCount: 3, lastError: "oops" },
    });
  });

  it("on 'commit' message calls onCommit and clears error + posts clearMessage", async () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    provider.resolveWebviewView(makeWebviewView(webview));

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
      state: { stagedCount: 0, lastError: undefined },
    });
    expect(webview.postMessage).toHaveBeenCalledWith({ type: "clearMessage" });
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
    provider.resolveWebviewView(makeWebviewView(webview));

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
      state: { stagedCount: 0, lastError: "boom" },
    });
  });

  it("ignores non-commit messages", async () => {
    const onCommit = vi.fn(async () => {});
    const provider = new CommitViewProvider(
      vscode.Uri.file("/ext") as any,
      onCommit,
    );

    const webview = makeWebview();
    provider.resolveWebviewView(makeWebviewView(webview));

    webview.postMessage.mockClear();

    await webview.__emitReceive({ type: "noop" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(webview.postMessage).not.toHaveBeenCalled();
  });
});
