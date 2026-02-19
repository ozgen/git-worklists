import { describe, it, expect, vi, beforeEach } from "vitest";

const vscodeMocks = vi.hoisted(() => {
  const fire = vi.fn();
  const event = vi.fn();

  class EventEmitter<T> {
    fire = fire;
    event = event;
  }

  const Uri = {
    parse: (s: string) => {
      const idx = s.indexOf(":/");
      const path = idx >= 0 ? s.slice(idx + 2) : s;
      return { path };
    },
    file: (fsPath: string) => ({ fsPath }),
  };

  return { EventEmitter, Uri, fire, event };
});

vi.mock("vscode", () => {
  return {
    EventEmitter: vscodeMocks.EventEmitter,
    Uri: vscodeMocks.Uri,
  };
});

import { GitShowContentProvider } from "../../../../adapters/vscode/gitShowContentProvider";

type GitClientMock = {
  showFileAtRefOptional: ReturnType<typeof vi.fn>;
  // Keep this optional because some places may still use it elsewhere
  showFileAtRef?: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vscodeMocks.fire.mockReset();
  vscodeMocks.event.mockReset();
});

describe("GitShowContentProvider", () => {
  it("parses ref and repo-relative path from uri.path and calls git.showFileAtRefOptional", async () => {
    const git: GitClientMock = {
      showFileAtRefOptional: vi.fn().mockResolvedValue("content"),
    };

    const provider = new GitShowContentProvider(git as any, "/repo");

    const uri = { path: "/HEAD/src/a.ts" } as any;

    const out = await provider.provideTextDocumentContent(uri);

    expect(out).toBe("content");
    expect(git.showFileAtRefOptional).toHaveBeenCalledWith(
      "/repo",
      "HEAD",
      "src/a.ts",
    );
  });

  it("decodes URI components (spaces etc.)", async () => {
    const git: GitClientMock = {
      showFileAtRefOptional: vi.fn().mockResolvedValue("x"),
    };

    const provider = new GitShowContentProvider(git as any, "/repo");

    const uri = { path: "/stash%40%7B2%7D/a%20b.txt" } as any;

    await provider.provideTextDocumentContent(uri);

    expect(git.showFileAtRefOptional).toHaveBeenCalledWith(
      "/repo",
      "stash@{2}",
      "a b.txt",
    );
  });

  it("uses HEAD when ref segment is missing (empty path)", async () => {
    const git: GitClientMock = {
      showFileAtRefOptional: vi.fn().mockResolvedValue("x"),
    };

    const provider = new GitShowContentProvider(git as any, "/repo");

    const uri = { path: "" } as any;

    await provider.provideTextDocumentContent(uri);

    expect(git.showFileAtRefOptional).toHaveBeenCalledWith("/repo", "HEAD", "");
  });

  it("returns empty string when ref is EMPTY", async () => {
    const git: GitClientMock = {
      showFileAtRefOptional: vi.fn(),
    };

    const provider = new GitShowContentProvider(git as any, "/repo");

    const uri = { path: "/EMPTY/src/a.ts" } as any;

    const out = await provider.provideTextDocumentContent(uri);

    expect(out).toBe("");
    expect(git.showFileAtRefOptional).not.toHaveBeenCalled();
  });

  it("refresh fires onDidChange event with the same uri", () => {
    const git: GitClientMock = { showFileAtRefOptional: vi.fn() };
    const provider = new GitShowContentProvider(git as any, "/repo");

    const uri = { path: "/HEAD/src/a.ts" } as any;

    provider.refresh(uri);

    expect(vscodeMocks.fire).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.fire).toHaveBeenCalledWith(uri);
  });

  it("exposes onDidChange event (smoke test)", () => {
    const git: GitClientMock = { showFileAtRefOptional: vi.fn() };
    const provider = new GitShowContentProvider(git as any, "/repo");

    expect(provider.onDidChange).toBeDefined();
  });
});
