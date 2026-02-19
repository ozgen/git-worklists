import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../adapters/vscode/gitShowContentProvider", () => {
  return { GitShowContentProvider: { scheme: "gitshow" } };
});

type ReceiveMsgHandler = (msg: any) => any;
type DisposeHandler = () => any;

type MockWebview = {
  html: string;
  postMessage: ReturnType<typeof vi.fn>;
  onDidReceiveMessage: (cb: ReceiveMsgHandler) => void;
  _receive?: ReceiveMsgHandler;
};

type MockPanel = {
  webview: MockWebview;
  visible: boolean;
  dispose: ReturnType<typeof vi.fn>;
  onDidDispose: (cb: DisposeHandler) => void;
  _onDispose?: DisposeHandler;
};

const vscodeMocks = vi.hoisted(() => {
  const showInformationMessage = vi.fn();
  const showErrorMessage = vi.fn();
  const executeCommand = vi.fn();

  const panels: MockPanel[] = [];

  const createWebviewPanel = vi.fn(() => {
    const webview: MockWebview = {
      html: "",
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

  const Uri = {
    parse: vi.fn((s: string) => ({ toString: () => s, __uri: s })),
  };

  return {
    window: {
      showInformationMessage,
      showErrorMessage,
      createWebviewPanel,
    },
    commands: {
      executeCommand,
    },
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
    Uri: vscodeMocks.Uri,
    ViewColumn: vscodeMocks.ViewColumn,
    ThemeIcon: vscodeMocks.ThemeIcon,
  };
});

import { openPushPreviewPanel } from "../../../views/pushPreviewPanel";

function makeDeps(overrides?: Partial<any>) {
  const deps: any = {
    git: {
      getUpstreamRef: vi.fn(async () => "origin/main"),
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

beforeEach(() => {
  vscodeMocks.window.showInformationMessage.mockReset();
  vscodeMocks.window.showErrorMessage.mockReset();

  vscodeMocks.window.createWebviewPanel.mockClear();

  vscodeMocks.commands.executeCommand.mockReset();
  (vscodeMocks.Uri.parse as any).mockClear();

  (vscodeMocks.__panels as any).length = 0;

  vi.spyOn(Date, "now").mockReturnValue(1234567890);
});

describe("openPushPreviewPanel", () => {
  it("returns cancel and shows info when there are no outgoing commits", async () => {
    const deps = makeDeps({
      git: {
        getUpstreamRef: vi.fn(async () => "origin/main"),
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

  it("creates panel, sets html, and preloads files for first commit", async () => {
    const deps = makeDeps({
      git: {
        getUpstreamRef: vi.fn(async () => "origin/main"),
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

    const panel = vscodeMocks.__panels[0];
    expect(panel.webview.html).toContain("Push Commits to");
    expect(panel.webview.html).toContain("origin/main");
    expect(panel.webview.html).toContain('id="pushBtn"');

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
        getUpstreamRef: vi.fn(async () => "origin/main"),
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
    expect(panel.webview._receive).toBeTypeOf("function");

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
        getUpstreamRef: vi.fn(async () => "origin/main"),
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

    const parseCalls = (vscodeMocks.Uri.parse as any).mock.calls.map(
      (c: any[]) => c[0],
    );
    expect(parseCalls[0]).toContain("gitshow:/");
    expect(parseCalls[0]).toContain(encodeURIComponent("aaaaaaaa^"));
    expect(parseCalls[1]).toContain(encodeURIComponent("aaaaaaaa"));

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
        getUpstreamRef: vi.fn(async () => "origin/main"),
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

    await Promise.resolve();

    const panel = vscodeMocks.__panels[0];
    expect(panel).toBeTruthy();
    expect(panel.webview._receive).toBeTypeOf("function");

    panel.webview._receive?.({ type: "push" });

    await expect(p).resolves.toBe("push");
  });
});
