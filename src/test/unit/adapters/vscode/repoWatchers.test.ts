import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Handler = (uri: { fsPath: string }) => void;

class FakeWatcher {
  public onDidCreateHandlers: Handler[] = [];
  public onDidChangeHandlers: Handler[] = [];
  public onDidDeleteHandlers: Handler[] = [];
  public disposed = false;

  onDidCreate(cb: Handler) {
    this.onDidCreateHandlers.push(cb);
  }
  onDidChange(cb: Handler) {
    this.onDidChangeHandlers.push(cb);
  }
  onDidDelete(cb: Handler) {
    this.onDidDeleteHandlers.push(cb);
  }
  dispose() {
    this.disposed = true;
  }

  fireCreate(path: string) {
    for (const h of this.onDidCreateHandlers) {
      h({ fsPath: path });
    }
  }
  fireChange(path: string) {
    for (const h of this.onDidChangeHandlers) {
      h({ fsPath: path });
    }
  }
  fireDelete(path: string) {
    for (const h of this.onDidDeleteHandlers) {
      h({ fsPath: path });
    }
  }
}

const BUCKET_KEY = "__repoWatchers_createdWatchers__" as const;

function getBucket(): FakeWatcher[] {
  const g = globalThis as any;
  if (!g[BUCKET_KEY]) {
    g[BUCKET_KEY] = [];
  }
  return g[BUCKET_KEY] as FakeWatcher[];
}

function resetBucket() {
  const g = globalThis as any;
  g[BUCKET_KEY] = [];
}

vi.mock("vscode", () => {
  class RelativePattern {
    base: string;
    pattern: string;
    constructor(base: string, pattern: string) {
      this.base = base;
      this.pattern = pattern;
    }
  }

  return {
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
    },
    RelativePattern,
    workspace: {
      createFileSystemWatcher: vi.fn(() => {
        const w = new FakeWatcher();
        getBucket().push(w);
        return w;
      }),
    },
  };
});

import { createRepoWatchers } from "../../../../adapters/vscode/repoWatchers";

describe("createRepoWatchers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetBucket();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates exactly two watchers (worktree + gitdir)", () => {
    const triggerRefresh = vi.fn();

    createRepoWatchers({
      repoRoot: "/repo",
      gitDir: "/repo/.git",
      triggerRefresh,
    });

    expect(getBucket().length).toBe(2);
  });

  it("triggers refresh after debounce for a worktree file change", () => {
    const triggerRefresh = vi.fn();

    createRepoWatchers({
      repoRoot: "/repo",
      gitDir: "/repo/.git",
      triggerRefresh,
      debounceMs: 100,
    });

    const [worktree] = getBucket();

    worktree.fireChange("/repo/src/a.ts");
    expect(triggerRefresh).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(99);
    expect(triggerRefresh).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1);
    expect(triggerRefresh).toHaveBeenCalledTimes(1);
  });

  it("does NOT trigger refresh for ignored worktree paths", () => {
    const triggerRefresh = vi.fn();

    createRepoWatchers({
      repoRoot: "/repo",
      gitDir: "/repo/.git",
      triggerRefresh,
      debounceMs: 50,
    });

    const [worktree] = getBucket();

    worktree.fireChange("/repo/node_modules/x/index.js");
    worktree.fireChange("/repo/.git/index");
    worktree.fireChange("/repo/dist/app.js");
    worktree.fireChange("/repo/coverage/out.txt");
    worktree.fireChange("/repo/.cache/foo");
    worktree.fireChange("/repo/tmp/file.tmp");
    worktree.fireChange("/repo/file.swp");

    vi.advanceTimersByTime(200);
    expect(triggerRefresh).toHaveBeenCalledTimes(0);
  });

  it("does NOT trigger refresh for worktree events outside repo root", () => {
    const triggerRefresh = vi.fn();

    createRepoWatchers({
      repoRoot: "/repo",
      gitDir: "/repo/.git",
      triggerRefresh,
      debounceMs: 50,
    });

    const [worktree] = getBucket();

    worktree.fireChange("/other/place/file.ts");
    vi.advanceTimersByTime(100);

    expect(triggerRefresh).toHaveBeenCalledTimes(0);
  });

  it("triggers refresh for git dir watcher events", () => {
    const triggerRefresh = vi.fn();

    createRepoWatchers({
      repoRoot: "/repo",
      gitDir: "/repo/.git",
      triggerRefresh,
      debounceMs: 80,
    });

    const [, gitWatcher] = getBucket();

    gitWatcher.fireChange("/repo/.git/index");

    vi.advanceTimersByTime(79);
    expect(triggerRefresh).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1);
    expect(triggerRefresh).toHaveBeenCalledTimes(1);
  });

  it("coalesces multiple events into a single refresh (debounce)", () => {
    const triggerRefresh = vi.fn();

    createRepoWatchers({
      repoRoot: "/repo",
      gitDir: "/repo/.git",
      triggerRefresh,
      debounceMs: 100,
    });

    const [worktree] = getBucket();

    worktree.fireChange("/repo/src/a.ts");
    vi.advanceTimersByTime(60);

    // second event resets debounce timer
    worktree.fireChange("/repo/src/b.ts");
    vi.advanceTimersByTime(60);

    expect(triggerRefresh).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(40);
    expect(triggerRefresh).toHaveBeenCalledTimes(1);
  });

  it("dispose clears timers and disposes both watchers", () => {
    const triggerRefresh = vi.fn();

    const watchers = createRepoWatchers({
      repoRoot: "/repo",
      gitDir: "/repo/.git",
      triggerRefresh,
      debounceMs: 100,
    });

    const [worktree, gitWatcher] = getBucket();

    worktree.fireChange("/repo/src/a.ts");
    watchers.dispose();

    vi.advanceTimersByTime(200);
    expect(triggerRefresh).toHaveBeenCalledTimes(0);

    expect(worktree.disposed).toBe(true);
    expect(gitWatcher.disposed).toBe(true);
  });
});
