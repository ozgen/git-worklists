import { describe, it, expect } from "vitest";
import {
  WorkspaceStateStore,
  type PersistedState,
} from "../../../adapters/storage/workspaceStateStore";
import type { MementoLike } from "../../../adapters/vscode/mementoFacade";

function makeMemento(
  initial: Record<string, unknown> = {},
): MementoLike & { dump(): Record<string, unknown> } {
  const data: Record<string, unknown> = { ...initial };

  return {
    get<T>(key: string) {
      return data[key] as T | undefined;
    },
    async update(key: string, value: unknown) {
      data[key] = value;
    },
    dump() {
      return { ...data };
    },
  };
}

describe("WorkspaceStateStore", () => {
  it("save/load uses per-repo key", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    const state: PersistedState = {
      version: 1,
      lists: [{ id: "1", name: "Default", files: ["a.txt"] }],
    };
    await store.save("/repo", state);

    const loaded = await store.load("/repo");
    expect(loaded).toEqual(state);

    const other = await store.load("/other");
    expect(other).toBeUndefined();
  });

  it("getSelectedFiles returns normalized set", async () => {
    const mem = makeMemento({
      "git-worklists.selection.v1:/repo": {
        version: 1,
        selectedFiles: ["a\\b.txt", "x/y.ts"],
      },
    });
    const store = new WorkspaceStateStore(mem);

    expect(store.getSelectedFiles("/repo")).toEqual(
      new Set(["a/b.txt", "x/y.ts"]),
    );
  });

  it("setSelectedFiles stores sorted + normalized", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await store.setSelectedFiles(
      "/repo",
      new Set(["z\\b.txt", "a\\c.txt", "a\\b.txt"]),
    );

    expect(mem.get("git-worklists.selection.v1:/repo")).toEqual({
      version: 1,
      selectedFiles: ["a/b.txt", "a/c.txt", "z/b.txt"],
    });
  });

  it("toggleSelectedFile adds/removes and returns new state", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    const added = await store.toggleSelectedFile("/repo", "a\\b.txt");
    expect(added).toBe(true);
    expect(store.getSelectedFiles("/repo")).toEqual(new Set(["a/b.txt"]));

    const removed = await store.toggleSelectedFile("/repo", "a/b.txt");
    expect(removed).toBe(false);
    expect(store.getSelectedFiles("/repo")).toEqual(new Set());
  });

  it("clearSelectedFiles empties selection", async () => {
    const mem = makeMemento({
      "git-worklists.selection.v1:/repo": {
        version: 1,
        selectedFiles: ["a.txt"],
      },
    });
    const store = new WorkspaceStateStore(mem);

    await store.clearSelectedFiles("/repo");
    expect(store.getSelectedFiles("/repo")).toEqual(new Set());
  });
});
