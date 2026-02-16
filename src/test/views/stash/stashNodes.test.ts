import { describe, it, expect, vi } from "vitest";

const vscodeMock = vi.hoisted(() => {
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
      public readonly label: string,
      public readonly collapsibleState: number,
    ) {}
  }

  return { TreeItem, TreeItemCollapsibleState, ThemeIcon };
});

vi.mock("vscode", () => vscodeMock);

import { toTreeItem } from "../../../views/stash/stashNodes";

describe("stashNodes.toTreeItem", () => {
  it("root node: creates expanded 'Stashes' TreeItem with context and icon", () => {
    const item = toTreeItem({ kind: "root" });

    expect(item.label).toBe("Stashes");
    expect(item.collapsibleState).toBe(
      vscodeMock.TreeItemCollapsibleState.Expanded,
    );
    expect(item.contextValue).toBe("gitWorklists.stashesRoot");
    expect((item.iconPath as any)?.id).toBe("archive");
  });

  it("stash node: parses GW tag, WIP/On branch, and formats label/desc/tooltip", () => {
    const node = {
      kind: "stash" as const,
      stash: {
        ref: "stash@{0}",
        message: "On main: GW:abc123456789 WIP message",
        raw: "stash@{0}: On main: GW:abc123456789 WIP message",
        isGitWorklists: true,
        changelistId: "abc123456789",
      },
    };

    const item = toTreeItem(node);

    expect(item.label).toBe("[CL:abc12345…] WIP message");

    expect(item.description).toBe("main");

    const tip = String(item.tooltip);
    expect(tip).toContain("stash@{0}");
    expect(tip).toContain("stash@{0}: On main: GW:abc123456789 WIP message");

    expect(item.collapsibleState).toBe(
      vscodeMock.TreeItemCollapsibleState.None,
    );
    expect(item.contextValue).toBe("gitWorklists.stashItem");
    expect((item.iconPath as any)?.id).toBe("archive");
  });

  it("stash node: unknown message format -> no desc, label is message (or 'Stash' if empty)", () => {
    const item1 = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{1}",
        message: "some random text",
        raw: "stash@{1}: some random text",
      },
    } as any);

    expect(item1.label).toBe("some random text");
    expect(item1.description).toBeUndefined();

    const item2 = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{2}",
        message: "  ",
        raw: "",
      },
    } as any);

    expect(item2.label).toBe("Stash");
  });

  it("also supports CL:<id> tag (not only GW:<id>)", () => {
    const item = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{3}",
        message: "WIP on dev: CL:zzzz9999 do thing",
        raw: "stash@{3}: WIP on dev: CL:zzzz9999 do thing",
      },
    } as any);

    expect(item.label).toBe("[CL:zzzz9999] do thing");
    expect(item.description).toBe("dev");
  });
});
