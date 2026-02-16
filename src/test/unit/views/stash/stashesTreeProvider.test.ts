import { describe, it, expect, vi, beforeEach } from "vitest";

const vscodeMock = vi.hoisted(() => {
  class EventEmitter<T> {
    public event = vi.fn();
    public fire = vi.fn((_arg?: T) => {});
    public dispose = vi.fn();
  }

  const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  } as const;

  class ThemeIcon {
    constructor(public readonly id: string) {}
  }

  class TreeItem {
    public contextValue?: string;
    public iconPath?: unknown;
    public description?: string;
    public tooltip?: unknown;

    constructor(
      public readonly label?: string,
      public readonly collapsibleState?: number,
    ) {}
  }

  return { EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon };
});

vi.mock("vscode", () => vscodeMock);


import { StashesTreeProvider } from "../../../../views/stash/stashesTreeProvider";

type FakeGitClient = {
  stashList: (repoRoot: string) => Promise<any[]>;
};

describe("StashesTreeProvider (unit)", () => {
  const repoRoot = "/repo";
  let git: FakeGitClient;

  beforeEach(() => {
    vi.clearAllMocks();
    git = {
      stashList: vi.fn(),
    };
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

  it("getChildren(root) calls git.stashList and maps to stash nodes", async () => {
    (git.stashList as any).mockResolvedValue([
      { ref: "stash@{0}", message: "m0", raw: "r0" },
      { ref: "stash@{1}", message: "m1", raw: "r1" },
    ]);

    const p = new StashesTreeProvider(repoRoot, git as any);

    const children = await p.getChildren({ kind: "root" } as any);

    expect(git.stashList).toHaveBeenCalledWith(repoRoot);
    expect(children).toEqual([
      { kind: "stash", stash: { ref: "stash@{0}", message: "m0", raw: "r0" } },
      { kind: "stash", stash: { ref: "stash@{1}", message: "m1", raw: "r1" } },
    ]);
  });

  it("getChildren(stash) returns []", async () => {
    const p = new StashesTreeProvider(repoRoot, git as any);

    const children = await p.getChildren({
      kind: "stash",
      stash: { ref: "stash@{0}", message: "m0", raw: "r0" },
    } as any);

    expect(children).toEqual([]);
  });

  it("getTreeItem returns a TreeItem (delegates to stashNodes)", () => {
    const p = new StashesTreeProvider(repoRoot, git as any);

    const item = p.getTreeItem({ kind: "root" } as any);

    expect(item).toBeTruthy();
    expect(item.label).toBe("Stashes");
    expect(item.contextValue).toBe("gitWorklists.stashesRoot");
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
