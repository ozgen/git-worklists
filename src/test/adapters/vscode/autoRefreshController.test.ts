import { describe, it, expect, vi } from "vitest";
import { AutoRefreshController } from "../../../adapters/vscode/autoRefreshController";
import type {
  VscodeFacade,
  DisposableLike,
  UriLike,
  FileSystemWatcherLike,
  RelativePatternLike,
  EventLike,
} from "../../../adapters/vscode/vscodeFacade";

function makeDisposable(): DisposableLike {
  return { dispose: vi.fn() };
}

function makeEvent<T>() {
  const listeners: Array<(e: T) => unknown> = [];
  const event: EventLike<T> = (listener) => {
    listeners.push(listener);
    return makeDisposable();
  };
  return {
    event,
    fire: (e: T) => {
      for (const l of listeners) {
        l(e);
      }
    },
    listenerCount: () => listeners.length,
  };
}

function makeWatcher() {
  const onDidChange = makeEvent<unknown>();
  const onDidCreate = makeEvent<unknown>();
  const onDidDelete = makeEvent<unknown>();

  const watcher: FileSystemWatcherLike = {
    onDidChange: onDidChange.event,
    onDidCreate: onDidCreate.event,
    onDidDelete: onDidDelete.event,
    dispose: vi.fn(),
  };

  return { watcher, onDidChange, onDidCreate, onDidDelete };
}

function makeVscodeStub() {
  const createFiles = makeEvent<{ readonly files: readonly UriLike[] }>();
  const deleteFiles = makeEvent<{ readonly files: readonly UriLike[] }>();
  const renameFiles = makeEvent<{
    readonly files: readonly {
      readonly oldUri: UriLike;
      readonly newUri: UriLike;
    }[];
  }>();
  const saveDoc = makeEvent<{ readonly uri: UriLike }>();

  const createdPatterns: Array<{ base: string; pattern: string }> = [];
  const watchers: ReturnType<typeof makeWatcher>[] = [];

  class RelativePattern implements RelativePatternLike {
    constructor(
      public base: string,
      public pattern: string,
    ) {
      createdPatterns.push({ base, pattern });
    }
  }

  const workspace = {
    createFileSystemWatcher: vi.fn((_pattern: RelativePatternLike) => {
      const w = makeWatcher();
      watchers.push(w);
      return w.watcher;
    }),
    onDidCreateFiles: createFiles.event,
    onDidDeleteFiles: deleteFiles.event,
    onDidRenameFiles: renameFiles.event,
    onDidSaveTextDocument: saveDoc.event,
  };

  const vs: VscodeFacade = {
    workspace: workspace as any,
    RelativePattern: RelativePattern as any,
  };

  return {
    vs,
    createdPatterns,
    watchers,
    fire: {
      createFiles: createFiles.fire,
      deleteFiles: deleteFiles.fire,
      renameFiles: renameFiles.fire,
      saveDoc: saveDoc.fire,
    },
  };
}

describe("AutoRefreshController", () => {
  it("watches .git/index and .git/HEAD", () => {
    const { vs, createdPatterns, watchers } = makeVscodeStub();
    const onSignal = vi.fn();

    const c = new AutoRefreshController(vs, "/repo", "/repo/.git", onSignal);
    c.start();

    expect(watchers.length).toBe(2);
    expect(createdPatterns).toEqual([
      { base: "/repo/.git", pattern: "index" },
      { base: "/repo/.git", pattern: "HEAD" },
    ]);
  });

  it("signals on git watcher events", () => {
    const { vs, watchers } = makeVscodeStub();
    const onSignal = vi.fn();

    const c = new AutoRefreshController(vs, "/repo", "/repo/.git", onSignal);
    c.start();

    // fire watcher events
    watchers[0].onDidChange.fire({});
    watchers[0].onDidCreate.fire({});
    watchers[1].onDidDelete.fire({});

    expect(onSignal).toHaveBeenCalledTimes(3);
  });

  it("signals only for workspace events inside repoRoot", () => {
    const { vs, fire } = makeVscodeStub();
    const onSignal = vi.fn();

    const c = new AutoRefreshController(vs, "/repo", "/repo/.git", onSignal);
    c.start();

    fire.createFiles({
      files: [{ fsPath: "/repo/a.txt" }, { fsPath: "/other/x.txt" }],
    });
    expect(onSignal).toHaveBeenCalledTimes(1);

    fire.deleteFiles({ files: [{ fsPath: "/other/y.txt" }] });
    expect(onSignal).toHaveBeenCalledTimes(1);

    fire.saveDoc({ uri: { fsPath: "/repo/src/main.ts" } });
    expect(onSignal).toHaveBeenCalledTimes(2);

    fire.renameFiles({
      files: [
        {
          oldUri: { fsPath: "/other/z.txt" },
          newUri: { fsPath: "/repo/z.txt" },
        },
      ],
    });
    expect(onSignal).toHaveBeenCalledTimes(3);
  });

  it("dispose disposes watchers and subscriptions", () => {
    const { vs, watchers } = makeVscodeStub();
    const onSignal = vi.fn();

    const c = new AutoRefreshController(vs, "/repo", "/repo/.git", onSignal);
    c.start();
    c.dispose();

    for (const w of watchers) {
      expect(w.watcher.dispose).toHaveBeenCalledTimes(1);
    }
  });
});
