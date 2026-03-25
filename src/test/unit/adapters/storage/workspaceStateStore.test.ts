import { describe, expect, it } from "vitest";
import {
  WorkspaceStateStore,
  type PersistedState,
} from "../../../../adapters/storage/workspaceStateStore";
import type { MementoLike } from "../../../../adapters/vscode/mementoFacade";

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

  it("getAll returns empty array when no bookmarks exist", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await expect(store.getAll("/repo")).resolves.toEqual([]);
  });

  it("set stores bookmarks under a per-repo key", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await store.set("/repo", {
      slot: 1,
      target: {
        repoRelativePath: "src/a.ts",
        line: 10,
        column: 2,
      },
    });

    expect(mem.get("git-worklists.bookmarks.v1:/repo")).toEqual({
      version: 1,
      entries: [
        {
          slot: 1,
          target: {
            repoRelativePath: "src/a.ts",
            line: 10,
            column: 2,
          },
        },
      ],
    });

    expect(mem.get("git-worklists.bookmarks.v1:/other")).toBeUndefined();
  });

  it("getAll returns bookmarks sorted by slot", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await store.set("/repo", {
      slot: 3,
      target: {
        repoRelativePath: "src/c.ts",
        line: 3,
        column: 3,
      },
    });

    await store.set("/repo", {
      slot: 1,
      target: {
        repoRelativePath: "src/a.ts",
        line: 1,
        column: 1,
      },
    });

    await store.set("/repo", {
      slot: 2,
      target: {
        repoRelativePath: "src/b.ts",
        line: 2,
        column: 2,
      },
    });

    await expect(store.getAll("/repo")).resolves.toEqual([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/a.ts",
          line: 1,
          column: 1,
        },
      },
      {
        slot: 2,
        target: {
          repoRelativePath: "src/b.ts",
          line: 2,
          column: 2,
        },
      },
      {
        slot: 3,
        target: {
          repoRelativePath: "src/c.ts",
          line: 3,
          column: 3,
        },
      },
    ]);
  });

  it("set replaces an existing bookmark in the same slot", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await store.set("/repo", {
      slot: 1,
      target: {
        repoRelativePath: "src/old.ts",
        line: 1,
        column: 0,
      },
    });

    await store.set("/repo", {
      slot: 1,
      target: {
        repoRelativePath: "src/new.ts",
        line: 9,
        column: 4,
      },
    });

    await expect(store.getAll("/repo")).resolves.toEqual([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/new.ts",
          line: 9,
          column: 4,
        },
      },
    ]);
  });

  it("getBySlot returns the matching bookmark", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await store.set("/repo", {
      slot: 2,
      target: {
        repoRelativePath: "src/b.ts",
        line: 5,
        column: 6,
      },
    });

    await expect(store.getBySlot("/repo", 2)).resolves.toEqual({
      slot: 2,
      target: {
        repoRelativePath: "src/b.ts",
        line: 5,
        column: 6,
      },
    });
  });

  it("getBySlot returns undefined when the slot does not exist", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await store.set("/repo", {
      slot: 1,
      target: {
        repoRelativePath: "src/a.ts",
        line: 0,
        column: 0,
      },
    });

    await expect(store.getBySlot("/repo", 9)).resolves.toBeUndefined();
  });

  it("clear removes only the given bookmark slot", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await store.set("/repo", {
      slot: 1,
      target: {
        repoRelativePath: "src/a.ts",
        line: 0,
        column: 0,
      },
    });

    await store.set("/repo", {
      slot: 2,
      target: {
        repoRelativePath: "src/b.ts",
        line: 1,
        column: 1,
      },
    });

    await store.clear("/repo", 1);

    await expect(store.getAll("/repo")).resolves.toEqual([
      {
        slot: 2,
        target: {
          repoRelativePath: "src/b.ts",
          line: 1,
          column: 1,
        },
      },
    ]);
  });

  it("clearAll removes all bookmarks for one repo only", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await store.set("/repo-a", {
      slot: 1,
      target: {
        repoRelativePath: "src/a.ts",
        line: 0,
        column: 0,
      },
    });

    await store.set("/repo-b", {
      slot: 2,
      target: {
        repoRelativePath: "src/b.ts",
        line: 2,
        column: 2,
      },
    });

    await store.clearAll("/repo-a");

    await expect(store.getAll("/repo-a")).resolves.toEqual([]);
    await expect(store.getAll("/repo-b")).resolves.toEqual([
      {
        slot: 2,
        target: {
          repoRelativePath: "src/b.ts",
          line: 2,
          column: 2,
        },
      },
    ]);
  });

  it("normalizes bookmark repoRelativePath when storing", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await store.set("/repo", {
      slot: 1,
      target: {
        repoRelativePath: "src\\nested\\file.ts",
        line: 7,
        column: 8,
      },
    });

    await expect(store.getAll("/repo")).resolves.toEqual([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/nested/file.ts",
          line: 7,
          column: 8,
        },
      },
    ]);
  });

  it("normalizes bookmark repoRelativePath when loading preexisting persisted data", async () => {
    const mem = makeMemento({
      "git-worklists.bookmarks.v1:/repo": {
        version: 1,
        entries: [
          {
            slot: 1,
            target: {
              repoRelativePath: "src\\a.ts",
              line: 3,
              column: 4,
            },
          },
          {
            slot: 2,
            target: {
              repoRelativePath: "nested\\b.ts",
              line: 5,
              column: 6,
            },
          },
        ],
      },
    });

    const store = new WorkspaceStateStore(mem);

    await expect(store.getAll("/repo")).resolves.toEqual([
      {
        slot: 1,
        target: {
          repoRelativePath: "src/a.ts",
          line: 3,
          column: 4,
        },
      },
      {
        slot: 2,
        target: {
          repoRelativePath: "nested/b.ts",
          line: 5,
          column: 6,
        },
      },
    ]);
  });

  it("keeps bookmarks isolated per repo", async () => {
    const mem = makeMemento();
    const store = new WorkspaceStateStore(mem);

    await store.set("/repo-a", {
      slot: 1,
      target: {
        repoRelativePath: "a.ts",
        line: 0,
        column: 0,
      },
    });

    await store.set("/repo-b", {
      slot: 1,
      target: {
        repoRelativePath: "b.ts",
        line: 1,
        column: 1,
      },
    });

    await expect(store.getAll("/repo-a")).resolves.toEqual([
      {
        slot: 1,
        target: {
          repoRelativePath: "a.ts",
          line: 0,
          column: 0,
        },
      },
    ]);

    await expect(store.getAll("/repo-b")).resolves.toEqual([
      {
        slot: 1,
        target: {
          repoRelativePath: "b.ts",
          line: 1,
          column: 1,
        },
      },
    ]);
  });

  it("returns empty bookmarks when persisted bookmark version is invalid", async () => {
    const mem = makeMemento({
      "git-worklists.bookmarks.v1:/repo": {
        version: 999,
        entries: [
          {
            slot: 1,
            target: {
              repoRelativePath: "a.ts",
              line: 0,
              column: 0,
            },
          },
        ],
      },
    });

    const store = new WorkspaceStateStore(mem);

    await expect(store.getAll("/repo")).resolves.toEqual([]);
  });
});
