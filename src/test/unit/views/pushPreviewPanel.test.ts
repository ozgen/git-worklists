import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";

vi.mock("../../../adapters/vscode/gitShowContentProvider", () => {
  return { GitShowContentProvider: { scheme: "gitshow" } };
});

type ReceiveMsgHandler = (msg: any) => any;
type DisposeHandler = () => any;

type MockWebview = {
  html: string;
  cspSource: string;
  asWebviewUri: (u: any) => any;
  postMessage: ReturnType<typeof vi.fn>;
  onDidReceiveMessage: (cb: ReceiveMsgHandler) => void;
  _receive?: ReceiveMsgHandler;
};

type MockPanel = {
  webview: MockWebview;
  visible: boolean;
  dispose: Mock<() => void>;
  onDidDispose: (cb: DisposeHandler) => void;
  _onDispose?: DisposeHandler;
};

const vscodeMocks = vi.hoisted(() => {
  const showInformationMessage = vi.fn();
  const showErrorMessage = vi.fn();
  const executeCommand = vi.fn();

  const panels: MockPanel[] = [];

  class Uri {
    constructor(public readonly fsPath: string) {}
    static file(p: string) {
      return new Uri(p);
    }
    static joinPath(base: Uri, ...paths: string[]) {
      const joined = path.join(base.fsPath, ...paths);
      return new Uri(joined);
    }
    static parse(s: string) {
      return { toString: () => s, __uri: s };
    }
  }

  const workspace = {
    fs: {
      readFile: vi.fn(async (_uri: any) => new Uint8Array()),
    },
  };

  const createWebviewPanel = vi.fn(() => {
    const webview: MockWebview = {
      html: "",
      cspSource: "vscode-resource://csp",
      asWebviewUri: vi.fn((u: any) => ({
        toString: () => `webview:${u.fsPath}`,
        __uri: `webview:${u.fsPath}`,
      })),
      postMessage: vi.fn(async () => true),
      onDidReceiveMessage: (cb: ReceiveMsgHandler) => {
        webview._receive = cb;
      },
    };

    const panel: MockPanel = {
      webview,
      visible: true,
      dispose: vi.fn(() => {
        if (panel._onDispose) {
          panel._onDispose();
        }
      }),
      onDidDispose: (cb: DisposeHandler) => {
        panel._onDispose = cb;
      },
    };

    panels.push(panel);
    return panel as any;
  });

  return {
    window: {
      showInformationMessage,
      showErrorMessage,
      createWebviewPanel,
    },
    commands: {
      executeCommand,
    },
    workspace,
    Uri,
    ViewColumn: { Active: 1 },
    ThemeIcon: vi.fn(),
    __panels: panels,
  };
});

vi.mock("vscode", () => {
  return {
    window: vscodeMocks.window,
    commands: vscodeMocks.commands,
    workspace: vscodeMocks.workspace,
    Uri: vscodeMocks.Uri,
    ViewColumn: vscodeMocks.ViewColumn,
    ThemeIcon: vscodeMocks.ThemeIcon,
  };
});

import { openPushPreviewPanel } from "../../../views/pushPreviewPanel";

function makeDeps(overrides?: Partial<any>) {
  const deps: any = {
    context: {
      extensionUri: (vscodeMocks.Uri as any).file(process.cwd()),
    },
    git: {
      tryGetUpstreamRef: vi.fn(async () => "origin/main"),
      listOutgoingCommits: vi.fn(async () => []),
      getCommitFiles: vi.fn(async () => []),
    },
    ...overrides,
  };
  return deps;
}

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

let TEMPLATE_BYTES: Uint8Array;

beforeEach(async () => {
  vscodeMocks.window.showInformationMessage.mockReset();
  vscodeMocks.window.showErrorMessage.mockReset();
  vscodeMocks.window.createWebviewPanel.mockClear();

  vscodeMocks.commands.executeCommand.mockReset();

  (vscodeMocks.workspace.fs.readFile as any).mockClear();

  (vscodeMocks.__panels as any).length = 0;

  vi.spyOn(Date, "now").mockReturnValue(1234567890);

  const templatePath = path.join(
    process.cwd(),
    "media",
    "pushPreview",
    "pushPreview.html",
  );
  const buf = await fs.readFile(templatePath);
  TEMPLATE_BYTES = new Uint8Array(buf);

  (vscodeMocks.workspace.fs.readFile as any).mockResolvedValue(TEMPLATE_BYTES);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openPushPreviewPanel", () => {
  it("returns cancel and shows info when there are no outgoing commits", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => []),
        getCommitFiles: vi.fn(async () => []),
      },
    });

    const res = await openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    expect(res).toBe("cancel");
    expect(vscodeMocks.window.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.window.createWebviewPanel).not.toHaveBeenCalled();
  });

  it("creates panel, sets html from media template, and preloads files for first commit", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => [
          {
            hash: "aaaaaaaa",
            shortHash: "aaaaaaa",
            subject: "First",
            authorName: "A",
            authorDateIso: "2026-02-19T00:00:00+01:00",
          },
          {
            hash: "bbbbbbbb",
            shortHash: "bbbbbbb",
            subject: "Second",
            authorName: "B",
            authorDateIso: "2026-02-19T01:00:00+01:00",
          },
        ]),
        getCommitFiles: vi.fn(async (_repo: string, hash: string) => {
          if (hash === "aaaaaaaa") {
            return [{ status: "M", path: "src/a.ts" }];
          }
          return [];
        }),
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    expect(vscodeMocks.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.workspace.fs.readFile).toHaveBeenCalledTimes(1);

    const panel = vscodeMocks.__panels[0];

    expect(panel.webview.html).toContain("Push Commits to");
    expect(panel.webview.html).toContain("origin/main");
    expect(panel.webview.html).toContain('id="pushBtn"');
    expect(panel.webview.html).toContain("script-src 'nonce-");

    expect(deps.git.getCommitFiles).toHaveBeenCalledWith("/repo", "aaaaaaaa");
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: "commitFiles",
      commitHash: "aaaaaaaa",
      files: [{ status: "M", path: "src/a.ts" }],
    });

    panel.webview._receive?.({ type: "cancel" });
    await expect(p).resolves.toBe("cancel");
  });

  it("handles selectCommit by fetching files and posting commitFiles", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => [
          { hash: "aaaaaaaa", shortHash: "aaaaaaa", subject: "First" },
          { hash: "bbbbbbbb", shortHash: "bbbbbbb", subject: "Second" },
        ]),
        getCommitFiles: vi.fn(async (_repo: string, hash: string) => {
          if (hash === "bbbbbbbb") {
            return [{ status: "A", path: "README.md" }];
          }
          return [];
        }),
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    const panel = vscodeMocks.__panels[0];

    await panel.webview._receive?.({ type: "selectCommit", hash: "bbbbbbbb" });

    expect(deps.git.getCommitFiles).toHaveBeenCalledWith("/repo", "bbbbbbbb");
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: "commitFiles",
      commitHash: "bbbbbbbb",
      files: [{ status: "A", path: "README.md" }],
    });

    panel.webview._receive?.({ type: "cancel" });
    await expect(p).resolves.toBe("cancel");
  });

  it("handles openDiff by executing vscode.diff with gitshow URIs", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => [
          { hash: "aaaaaaaa", shortHash: "aaaaaaa", subject: "First" },
        ]),
        getCommitFiles: vi.fn(async () => [{ status: "M", path: "src/a.ts" }]),
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    const panel = vscodeMocks.__panels[0];

    await panel.webview._receive?.({
      type: "openDiff",
      hash: "aaaaaaaa",
      path: "src/a.ts",
    });

    expect(vscodeMocks.commands.executeCommand).toHaveBeenCalledTimes(1);
    const [cmd, leftUri, rightUri, title] =
      vscodeMocks.commands.executeCommand.mock.calls[0];

    expect(cmd).toBe("vscode.diff");
    expect(String((leftUri as any).__uri)).toContain("gitshow:/");
    expect(String((rightUri as any).__uri)).toContain("gitshow:/");
    expect(title).toContain("src/a.ts");
    expect(title).toContain("aaaaaaa");

    panel.webview._receive?.({ type: "cancel" });
    await expect(p).resolves.toBe("cancel");
  });

  it("resolves push when receiving push message (not overwritten by dispose)", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => [
          { hash: "aaaaaaaa", shortHash: "aaaaaaa", subject: "First" },
        ]),
        getCommitFiles: vi.fn(async () => []),
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    const panel = vscodeMocks.__panels[0];
    panel.webview._receive?.({ type: "push" });

    await expect(p).resolves.toBe("push");
  });

  it("renders no-upstream label and title when upstreamRef is null", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => null),
        listOutgoingCommits: vi.fn(async () => [
          { hash: "aaaaaaaa", shortHash: "aaaaaaa", subject: "First" },
        ]),
        getCommitFiles: vi.fn(async () => []),
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    expect(vscodeMocks.window.createWebviewPanel).toHaveBeenCalledTimes(1);

    const createArgs = vscodeMocks.window.createWebviewPanel.mock
      .calls[0] as any[];
    const title = createArgs[1];
    expect(String(title)).toContain("Set Upstream");

    const panel = vscodeMocks.__panels[0];
    expect(panel.webview.html).toContain("(no upstream");

    panel.webview._receive?.({ type: "cancel" });
    await expect(p).resolves.toBe("cancel");
  });

  it("shows correct info message when no commits and no upstream", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => null),
        listOutgoingCommits: vi.fn(async () => []),
        getCommitFiles: vi.fn(async () => []),
      },
    });

    const res = await openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    expect(res).toBe("cancel");
    expect(vscodeMocks.window.showInformationMessage).toHaveBeenCalledTimes(1);

    const msg = vscodeMocks.window.showInformationMessage.mock.calls[0]?.[0];
    expect(String(msg)).toContain("no local-only commits");
    expect(vscodeMocks.window.createWebviewPanel).not.toHaveBeenCalled();
  });

  it("renders force-with-lease push label when forceWithLease=true", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => [
          { hash: "aaaaaaaa", shortHash: "aaaaaaa", subject: "First" },
        ]),
        getCommitFiles: vi.fn(async () => []),
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: true,
    });
    await flushMicrotasks();

    const panel = vscodeMocks.__panels[0];
    expect(panel.webview.html).toContain("force-with-lease");

    panel.webview._receive?.({ type: "cancel" });
    await expect(p).resolves.toBe("cancel");
  });

  it("openDiff uses EMPTY leftRef for added files (status A)", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => [
          { hash: "aaaaaaaa", shortHash: "aaaaaaa", subject: "First" },
        ]),
        getCommitFiles: vi.fn(async () => []),
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    const panel = vscodeMocks.__panels[0];

    await panel.webview._receive?.({
      type: "openDiff",
      hash: "aaaaaaaa",
      path: "new.txt",
      status: "A",
    });

    expect(vscodeMocks.commands.executeCommand).toHaveBeenCalledTimes(1);

    const [, leftUri, rightUri] =
      vscodeMocks.commands.executeCommand.mock.calls[0];

    // Left must use EMPTY ref
    expect(String((leftUri as any).__uri)).toContain(
      encodeURIComponent("EMPTY"),
    );
    // Right uses hash
    expect(String((rightUri as any).__uri)).toContain(
      encodeURIComponent("aaaaaaaa"),
    );

    panel.webview._receive?.({ type: "cancel" });
    await expect(p).resolves.toBe("cancel");
  });

  it("openDiff uses oldPath on left side for renamed files (status R)", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => [
          { hash: "aaaaaaaa", shortHash: "aaaaaaa", subject: "First" },
        ]),
        getCommitFiles: vi.fn(async () => []),
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    const panel = vscodeMocks.__panels[0];

    await panel.webview._receive?.({
      type: "openDiff",
      hash: "aaaaaaaa",
      path: "new/name.txt",
      oldPath: "old/name.txt",
      status: "R100",
    });

    expect(vscodeMocks.commands.executeCommand).toHaveBeenCalledTimes(1);
    const [, leftUri, rightUri] =
      vscodeMocks.commands.executeCommand.mock.calls[0];

    // left should encode oldPath
    expect(String((leftUri as any).__uri)).toContain(
      encodeURIComponent("old/name.txt"),
    );
    // right should encode new path
    expect(String((rightUri as any).__uri)).toContain(
      encodeURIComponent("new/name.txt"),
    );

    panel.webview._receive?.({ type: "cancel" });
    await expect(p).resolves.toBe("cancel");
  });

  it("ignores invalid messages (no crash, no calls)", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => [
          { hash: "aaaaaaaa", shortHash: "aaaaaaa", subject: "First" },
        ]),
        getCommitFiles: vi.fn(async () => []), // preload ok
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    const panel = vscodeMocks.__panels[0];

    deps.git.getCommitFiles.mockClear();
    vscodeMocks.commands.executeCommand.mockClear();
    vscodeMocks.window.showErrorMessage.mockClear();

    await panel.webview._receive?.(null);
    await panel.webview._receive?.({ type: 123 });
    await panel.webview._receive?.({ type: "selectCommit" });
    await panel.webview._receive?.({ type: "openDiff", hash: "", path: "x" });
    await panel.webview._receive?.({
      type: "openDiff",
      hash: "aaaaaaaa",
      path: "",
    });

    expect(deps.git.getCommitFiles).not.toHaveBeenCalled();
    expect(vscodeMocks.commands.executeCommand).not.toHaveBeenCalled();
    expect(vscodeMocks.window.showErrorMessage).not.toHaveBeenCalled();

    panel.webview._receive?.({ type: "cancel" });
    await expect(p).resolves.toBe("cancel");
  });

  it("shows error message if handler throws inside onDidReceiveMessage", async () => {
    const getCommitFiles = vi
      .fn()
      // 1st call: initial preload must succeed
      .mockResolvedValueOnce([])
      // 2nd call: triggered by selectCommit -> should be caught
      .mockRejectedValueOnce(new Error("boom"));

    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => [
          { hash: "aaaaaaaa", shortHash: "aaaaaaa", subject: "First" },
        ]),
        getCommitFiles,
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    const panel = vscodeMocks.__panels[0];

    await panel.webview._receive?.({ type: "selectCommit", hash: "aaaaaaaa" });
    await flushMicrotasks();

    expect(vscodeMocks.window.showErrorMessage).toHaveBeenCalledTimes(1);
    const msg = vscodeMocks.window.showErrorMessage.mock.calls[0]?.[0];
    expect(String(msg)).toContain("push preview panel error");

    panel.webview._receive?.({ type: "cancel" });
    await expect(p).resolves.toBe("cancel");
  });

  it("resolves cancel when panel is disposed without any message", async () => {
    const deps = makeDeps({
      git: {
        tryGetUpstreamRef: vi.fn(async () => "origin/main"),
        listOutgoingCommits: vi.fn(async () => [
          { hash: "aaaaaaaa", shortHash: "aaaaaaa", subject: "First" },
        ]),
        getCommitFiles: vi.fn(async () => []),
      },
    });

    const p = openPushPreviewPanel(deps, {
      repoRoot: "/repo",
      forceWithLease: false,
    });
    await flushMicrotasks();

    const panel = vscodeMocks.__panels[0];

    panel.dispose();

    await expect(p).resolves.toBe("cancel");
  });
});
