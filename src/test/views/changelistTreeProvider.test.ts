import { describe, it, expect, vi, beforeEach } from "vitest";

const vscodeMock = vi.hoisted(() => {
  class EventEmitter<T> {
    private listeners: ((e: T) => void)[] = [];
    event = (cb: (e: T) => void) => {
      this.listeners.push(cb);
      return { dispose() {} };
    };
    fire(e?: T) {
      for (const cb of this.listeners) {
        cb(e as T);
      }
    }
  }

  const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  } as const;

  class ThemeIcon {
    constructor(public readonly id: string) {}
  }

  class Uri {
    constructor(public readonly fsPath: string) {}
    static file(p: string) {
      return new Uri(p);
    }
    static joinPath(base: Uri, rel: string) {
      const b = base.fsPath.replace(/\/+$/, "");
      const r = rel.replace(/^\/+/, "");
      return new Uri(`${b}/${r}`);
    }
  }

  class TreeItem {
    label?: string;
    collapsibleState?: number;
    contextValue?: string;
    iconPath?: any;
    command?: any;
    description?: string;
    resourceUri?: any;
    constructor(label?: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  return {
    EventEmitter,
    TreeItemCollapsibleState,
    ThemeIcon,
    Uri,
    TreeItem,
  };
});

vi.mock("vscode", () => vscodeMock);

import { ChangelistTreeProvider } from "../../views/changelistTreeProvider";
import { SystemChangelist } from "../../core/changelist/systemChangelist";

type PersistedState = {
  version: 1;
  lists: { id: string; name: string; files: string[] }[];
};

function makeStore(state: PersistedState | undefined) {
  return {
    load: vi.fn(async (_repoRoot: string) => state),
    save: vi.fn(async () => {}),
  };
}

describe("ChangelistTreeProvider (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty when repoRoot not set", async () => {
    const store = makeStore(undefined);
    const tp = new ChangelistTreeProvider(store as any);

    const rootChildren = await tp.getChildren(undefined as any);
    expect(rootChildren).toEqual([]);
  });

  it("root shows system lists first then custom lists sorted by name", async () => {
    const state: PersistedState = {
      version: 1,
      lists: [
        { id: "cl_b", name: "Beta", files: ["b.txt"] },
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["u1.txt", "u2.txt"],
        },
        { id: "cl_a", name: "Alpha", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["c.txt"] },
      ],
    };

    const store = makeStore(state);
    const tp = new ChangelistTreeProvider(store as any);

    tp.setRepoRoot("/repo");
    tp.setStagedPaths(new Set());

    const root = await tp.getChildren(undefined as any);

    expect(root.map((n: any) => n.label)).toEqual([
      "Changes (1)",
      "Unversioned Files (2)",
      "Alpha (0)",
      "Beta (1)",
    ]);

    // system vs custom contextValue
    expect((root[0] as any).contextValue).toBe("gitWorklists.group.system");
    expect((root[1] as any).contextValue).toBe("gitWorklists.group.system");
    expect((root[2] as any).contextValue).toBe("gitWorklists.group.custom");

    // icon for none-staged group is "square"
    expect(((root[0] as any).iconPath as any).id).toBe("square");
  });

  it("group icon reflects stage state: all / none / mixed", async () => {
    const state: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["a.txt", "b.txt", "c.txt"],
        },
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["u.txt"],
        },
      ],
    };

    const store = makeStore(state);
    const tp = new ChangelistTreeProvider(store as any);
    tp.setRepoRoot("/repo");

    tp.setStagedPaths(new Set(["a.txt", "c.txt", "u.txt"]));

    const root = await tp.getChildren(undefined as any);
    const changes = root[0] as any;
    const unv = root[1] as any;

    expect((changes.iconPath as any).id).toBe("remove"); // mixed
    expect((unv.iconPath as any).id).toBe("check"); // all
  });

  it("group children are FileNodes with correct resourceUri, description, command, workStatus", async () => {
    const state: PersistedState = {
      version: 1,
      lists: [
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["z.txt", "dir/a.txt"],
        },
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["u\\x.txt"],
        },
      ],
    };

    const store = makeStore(state);
    const tp = new ChangelistTreeProvider(store as any);
    tp.setRepoRoot("/repo");

    tp.setStagedPaths(new Set(["dir/a.txt", "u/x.txt"]));

    const root = await tp.getChildren(undefined as any);

    const changesGroup = root[0] as any;
    const unvGroup = root[1] as any;

    const changesFiles = await tp.getChildren(changesGroup);
    expect(changesFiles.map((n: any) => n.label)).toEqual([
      "dir/a.txt",
      "z.txt",
    ]);

    const f0 = changesFiles[0] as any;
    expect(f0.workStatus).toBe("tracked");
    expect(f0.isStaged).toBe(true);
    expect(f0.description).toBe("dir");
    expect(f0.resourceUri.fsPath).toBe("/repo/dir/a.txt");
    expect(f0.command.command).toBe("gitWorklists.unstagePath");
    expect(f0.command.arguments[0].fsPath).toBe("/repo/dir/a.txt");

    const f1 = changesFiles[1] as any;
    expect(f1.workStatus).toBe("tracked");
    expect(f1.isStaged).toBe(false);
    expect(f1.description).toBeUndefined();
    expect(f1.command.command).toBe("gitWorklists.stagePath");

    const unvFiles = await tp.getChildren(unvGroup);
    const u0 = unvFiles[0] as any;
    expect(u0.label).toBe("u/x.txt");
    expect(u0.workStatus).toBe("unversioned");
    expect(u0.isStaged).toBe(true);
  });

  it("refresh fires onDidChangeTreeData", async () => {
    const state: PersistedState = {
      version: 1,
      lists: [{ id: SystemChangelist.Default, name: "Changes", files: [] }],
    };

    const store = makeStore(state);
    const tp = new ChangelistTreeProvider(store as any);

    const listener = vi.fn();
    tp.onDidChangeTreeData(listener);

    tp.setRepoRoot("/repo");
    expect(listener).toHaveBeenCalledTimes(1);

    tp.refresh();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
