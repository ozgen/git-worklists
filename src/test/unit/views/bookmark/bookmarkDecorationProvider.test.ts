import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  class MockRange {
    constructor(
      public readonly startLine: number,
      public readonly startCharacter: number,
      public readonly endLine: number,
      public readonly endCharacter: number,
    ) {}
  }

  return {
    window: {
      visibleTextEditors: [],
      activeTextEditor: undefined,
      createTextEditorDecorationType: vi.fn(),
    },
    Uri: {
      joinPath: vi.fn(),
    },
    Range: MockRange,
    OverviewRulerLane: {
      Left: 1,
    },
  };
});

import * as vscode from "vscode";
import type { BookmarkEntry } from "../../../../core/bookmark/bookmark";
import { BookmarkDecorationProvider } from "../../../../views/bookmark/bookmarkDecorationProvider";

function makeDecoration(slot: number) {
  return {
    slot,
    dispose: vi.fn(),
  };
}

function makeEditor(fsPath: string, scheme = "file", lineCount = 100) {
  return {
    document: {
      uri: {
        scheme,
        fsPath,
      },
      lineCount,
    },
    setDecorations: vi.fn(),
  };
}

function makeStore(entries: BookmarkEntry[]) {
  return {
    getAll: vi.fn().mockResolvedValue(entries),
  };
}

describe("BookmarkDecorationProvider", () => {
  const extensionUri = { path: "/ext" } as any;

  beforeEach(() => {
    (vscode.window.visibleTextEditors as any[]).length = 0;
    (vscode.window as any).activeTextEditor = undefined;

    vi.mocked(vscode.window.createTextEditorDecorationType).mockReset();
    vi.mocked(vscode.Uri.joinPath).mockReset();

    vi.mocked(vscode.Uri.joinPath).mockImplementation(
      (_base: unknown, ...segments: string[]) =>
        ({
          fsPath: segments.join("/"),
          path: segments.join("/"),
          toString: () => segments.join("/"),
        }) as any,
    );

    vi.mocked(vscode.window.createTextEditorDecorationType).mockImplementation(
      () => makeDecoration(0) as any,
    );
  });

  it("does nothing when repo root is not set", async () => {
    const store = makeStore([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/a.ts",
          line: 3,
          column: 1,
        },
      },
    ]);

    const editor = makeEditor("/repo/src/a.ts");
    (vscode.window.visibleTextEditors as any[]).push(editor);

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );

    await provider.refreshVisibleEditors();

    expect(store.getAll).not.toHaveBeenCalled();
    expect(editor.setDecorations).not.toHaveBeenCalled();
  });

  it("does nothing for non-file editors", async () => {
    const store = makeStore([]);
    const editor = makeEditor("/repo/src/a.ts", "git");
    (vscode.window.visibleTextEditors as any[]).push(editor);

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );
    provider.setRepoRoot("/repo");

    await provider.refreshVisibleEditors();

    expect(store.getAll).not.toHaveBeenCalled();
    expect(editor.setDecorations).not.toHaveBeenCalled();
  });

  it("does nothing for files outside the repo root", async () => {
    const store = makeStore([]);
    const editor = makeEditor("/other/src/a.ts");
    (vscode.window.visibleTextEditors as any[]).push(editor);

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );
    provider.setRepoRoot("/repo");

    await provider.refreshVisibleEditors();

    expect(store.getAll).not.toHaveBeenCalled();
    expect(editor.setDecorations).not.toHaveBeenCalled();
  });

  it("applies a decoration for a matching bookmark", async () => {
    const decoration = makeDecoration(1);
    vi.mocked(vscode.window.createTextEditorDecorationType).mockReturnValue(
      decoration as any,
    );

    const store = makeStore([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/a.ts",
          line: 10,
          column: 2,
        },
      },
    ]);

    const editor = makeEditor("/repo/src/a.ts", "file", 50);
    (vscode.window.visibleTextEditors as any[]).push(editor);

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );
    provider.setRepoRoot("/repo");

    await provider.refreshVisibleEditors();

    expect(store.getAll).toHaveBeenCalledWith("/repo");
    expect(vscode.Uri.joinPath).toHaveBeenCalledWith(
      extensionUri,
      "media",
      "bookmarks",
      "bookmark-1.svg",
    );
    expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledTimes(
      1,
    );
    expect(editor.setDecorations).toHaveBeenCalledTimes(1);

    const [usedDecoration, ranges] = editor.setDecorations.mock.calls[0];
    expect(usedDecoration).toBe(decoration);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].hoverMessage).toBe("Bookmark 1");
    expect(ranges[0].range).toEqual(new (vscode.Range as any)(10, 0, 10, 0));
  });

  it("does not apply decorations when no bookmarks match the current file", async () => {
    const store = makeStore([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/other.ts",
          line: 10,
          column: 2,
        },
      },
    ]);

    const editor = makeEditor("/repo/src/a.ts", "file", 50);
    (vscode.window.visibleTextEditors as any[]).push(editor);

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );
    provider.setRepoRoot("/repo");

    await provider.refreshVisibleEditors();

    expect(store.getAll).toHaveBeenCalledWith("/repo");
    expect(vscode.window.createTextEditorDecorationType).not.toHaveBeenCalled();
    expect(editor.setDecorations).not.toHaveBeenCalled();
  });

  it("clamps negative bookmark lines to 0", async () => {
    const decoration = makeDecoration(1);
    vi.mocked(vscode.window.createTextEditorDecorationType).mockReturnValue(
      decoration as any,
    );

    const store = makeStore([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/a.ts",
          line: -5,
          column: 0,
        },
      },
    ]);

    const editor = makeEditor("/repo/src/a.ts", "file", 20);
    (vscode.window.visibleTextEditors as any[]).push(editor);

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );
    provider.setRepoRoot("/repo");

    await provider.refreshVisibleEditors();

    const [, ranges] = editor.setDecorations.mock.calls[0];
    expect(ranges[0].range).toEqual(new (vscode.Range as any)(0, 0, 0, 0));
  });

  it("clamps bookmark lines larger than document line count", async () => {
    const decoration = makeDecoration(1);
    vi.mocked(vscode.window.createTextEditorDecorationType).mockReturnValue(
      decoration as any,
    );

    const store = makeStore([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/a.ts",
          line: 999,
          column: 0,
        },
      },
    ]);

    const editor = makeEditor("/repo/src/a.ts", "file", 7);
    (vscode.window.visibleTextEditors as any[]).push(editor);

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );
    provider.setRepoRoot("/repo");

    await provider.refreshVisibleEditors();

    const [, ranges] = editor.setDecorations.mock.calls[0];
    expect(ranges[0].range).toEqual(new (vscode.Range as any)(6, 0, 6, 0));
  });

  it("reuses the same decoration instance for the same slot", async () => {
    const decoration = makeDecoration(1);
    vi.mocked(vscode.window.createTextEditorDecorationType).mockReturnValue(
      decoration as any,
    );

    const store = makeStore([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/a.ts",
          line: 1,
          column: 0,
        },
      },
    ]);

    const editorA = makeEditor("/repo/src/a.ts", "file", 20);
    const editorB = makeEditor("/repo/src/a.ts", "file", 20);
    (vscode.window.visibleTextEditors as any[]).push(editorA, editorB);

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );
    provider.setRepoRoot("/repo");

    await provider.refreshVisibleEditors();

    expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledTimes(
      1,
    );
  });

  it("refreshActiveEditor refreshes only the active editor", async () => {
    const decoration = makeDecoration(1);
    vi.mocked(vscode.window.createTextEditorDecorationType).mockReturnValue(
      decoration as any,
    );

    const store = makeStore([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/a.ts",
          line: 2,
          column: 0,
        },
      },
    ]);

    const activeEditor = makeEditor("/repo/src/a.ts", "file", 20);
    const otherEditor = makeEditor("/repo/src/b.ts", "file", 20);

    (vscode.window.visibleTextEditors as any[]).push(activeEditor, otherEditor);
    (vscode.window as any).activeTextEditor = activeEditor;

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );
    provider.setRepoRoot("/repo");

    await provider.refreshActiveEditor();

    expect(activeEditor.setDecorations).toHaveBeenCalledTimes(1);
    expect(otherEditor.setDecorations).not.toHaveBeenCalled();
  });

  it("clearAllEditors clears all applied decoration types from visible editors", async () => {
    const deco1 = makeDecoration(1);
    const deco2 = makeDecoration(2);

    vi.mocked(vscode.window.createTextEditorDecorationType)
      .mockReturnValueOnce(deco1 as any)
      .mockReturnValueOnce(deco2 as any);

    const store = makeStore([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/a.ts",
          line: 1,
          column: 0,
        },
      },
      {
        slot: 2,
        target: {
          repoRelativePath: "src/a.ts",
          line: 4,
          column: 0,
        },
      },
    ]);

    const editor = makeEditor("/repo/src/a.ts", "file", 20);
    (vscode.window.visibleTextEditors as any[]).push(editor);

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );
    provider.setRepoRoot("/repo");

    await provider.refreshVisibleEditors();
    editor.setDecorations.mockClear();

    provider.clearAllEditors();

    expect(editor.setDecorations).toHaveBeenCalledTimes(2);
    expect(editor.setDecorations).toHaveBeenNthCalledWith(1, deco1, []);
    expect(editor.setDecorations).toHaveBeenNthCalledWith(2, deco2, []);
  });

  it("dispose disposes created decoration types", async () => {
    const deco1 = makeDecoration(1);
    const deco2 = makeDecoration(2);

    vi.mocked(vscode.window.createTextEditorDecorationType)
      .mockReturnValueOnce(deco1 as any)
      .mockReturnValueOnce(deco2 as any);

    const store = makeStore([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/a.ts",
          line: 1,
          column: 0,
        },
      },
      {
        slot: 2,
        target: {
          repoRelativePath: "src/a.ts",
          line: 4,
          column: 0,
        },
      },
    ]);

    const editor = makeEditor("/repo/src/a.ts", "file", 20);
    (vscode.window.visibleTextEditors as any[]).push(editor);

    const provider = new BookmarkDecorationProvider(
      store as any,
      { extensionUri } as any,
    );
    provider.setRepoRoot("/repo");

    await provider.refreshVisibleEditors();
    provider.dispose();

    expect(deco1.dispose).toHaveBeenCalledTimes(1);
    expect(deco2.dispose).toHaveBeenCalledTimes(1);
  });
});