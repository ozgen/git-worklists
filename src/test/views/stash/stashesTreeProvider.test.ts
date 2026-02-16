import { describe, it, expect, vi, beforeEach } from "vitest";

const vscodeMock = vi.hoisted(() => {
  class EventEmitter<T> {
    public event = vi.fn();
    public fire = vi.fn((_arg?: T) => {});
    public dispose = vi.fn();
  }

  class TreeItem {
    constructor(public readonly label?: string) {}
  }

  return { EventEmitter, TreeItem };
});

vi.mock("vscode", () => vscodeMock);

const stashNodesMock = vi.hoisted(() => {
  return {
    toTreeItem: vi.fn((node: any) => ({ label: `node:${node.kind}` })),
  };
});

vi.mock("../../../views/stash/stashNodes", () => stashNodesMock);

const listStashesMock = vi.hoisted(() => {
  const run = vi.fn();

  class ListStashes {
    constructor(_git: unknown) {}
    run = run;
  }

  return { ListStashes, run };
});

vi.mock("../../../usecases/stash/listStashes", () => listStashesMock);

import { StashesTreeProvider } from "../../../views/stash/stashesTreeProvider";

type FakeGitClient = Record<string, unknown>;

describe("StashesTreeProvider (unit)", () => {
  const repoRoot = "/repo";
  let git: FakeGitClient;

  beforeEach(() => {
    vi.clearAllMocks();
    git = {};
  });

  it("refresh fires tree change with undefined", () => {
    const p = new StashesTreeProvider(repoRoot, git as any);

    p.refresh();

    const emitter = (p as any).onDidChangeTreeDataEmitter;
    expect(emitter.fire).toHaveBeenCalledWith(undefined);
  });

  it("getChildren returns root node at top-level", async () => {
    const p = new StashesTreeProvider(repoRoot, git as any);

    const children = await p.getChildren();

    expect(children).toEqual([{ kind: "root" }]);
  });

  it("getChildren(root) calls ListStashes and maps to stash nodes", async () => {
    listStashesMock.run.mockResolvedValueOnce([
      { ref: "stash@{0}", message: "m0" },
      { ref: "stash@{1}", message: "m1" },
    ]);

    const p = new StashesTreeProvider(repoRoot, git as any);

    const children = await p.getChildren({ kind: "root" } as any);

    expect(listStashesMock.run).toHaveBeenCalledWith(repoRoot);
    expect(children).toEqual([
      { kind: "stash", stash: { ref: "stash@{0}", message: "m0" } },
      { kind: "stash", stash: { ref: "stash@{1}", message: "m1" } },
    ]);
  });

  it("getChildren(stash) returns []", async () => {
    const p = new StashesTreeProvider(repoRoot, git as any);

    const children = await p.getChildren({
      kind: "stash",
      stash: { ref: "stash@{0}", message: "m0" },
    } as any);

    expect(children).toEqual([]);
  });

  it("getTreeItem delegates to toTreeItem", () => {
    const p = new StashesTreeProvider(repoRoot, git as any);

    const item = p.getTreeItem({ kind: "root" } as any);

    expect(stashNodesMock.toTreeItem).toHaveBeenCalledWith({ kind: "root" });
    expect(item).toEqual({ label: "node:root" });
  });

  it("dispose marks disposed and stops returning children", async () => {
    const p = new StashesTreeProvider(repoRoot, git as any);

    p.dispose();

    expect(await p.getChildren()).toEqual([]);
    expect(await p.getChildren({ kind: "root" } as any)).toEqual([]);

    const emitter = (p as any).onDidChangeTreeDataEmitter;
    expect(emitter.dispose).toHaveBeenCalled();
  });
});
