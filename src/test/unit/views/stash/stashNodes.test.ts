import { describe, expect, it, vi } from "vitest";

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
    public command?: any;

    constructor(
      public readonly label: string,
      public readonly collapsibleState: number,
    ) {}
  }

  return { TreeItem, TreeItemCollapsibleState, ThemeIcon };
});

vi.mock("vscode", () => vscodeMock);

import { toTreeItem } from "../../../../views/stash/stashNodes";

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

    const item = toTreeItem(node as any);

    expect(item.label).toBe("[CL:abc12345…] WIP message");
    expect(item.description).toBe("main");

    const tip = String(item.tooltip);
    expect(tip).toContain("stash@{0}");
    expect(tip).toContain("stash@{0}: On main: GW:abc123456789 WIP message");

    // IMPORTANT: stash is now an accordion parent => Collapsed
    expect(item.collapsibleState).toBe(
      vscodeMock.TreeItemCollapsibleState.Collapsed,
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

  it("stashFile node: creates leaf TreeItem with diff command, context, icon, tooltip", () => {
    const node = {
      kind: "stashFile" as const,
      stash: {
        ref: "stash@{0}",
        message: "On main: GW:abc123 WIP",
        raw: "stash@{0}: On main: GW:abc123 WIP",
      },
      path: "src/a.ts",
      status: "M" as const,
    };

    const item = toTreeItem(node as any);

    expect(item.label).toBe("src/a.ts");
    expect(item.collapsibleState).toBe(
      vscodeMock.TreeItemCollapsibleState.None,
    );

    expect(item.contextValue).toBe("gitWorklists.stashFile");
    expect((item.iconPath as any)?.id).toBe("diff");

    expect(item.description).toBe("M");

    const tip = String(item.tooltip);
    expect(tip).toContain("stash@{0}");
    expect(tip).toContain("src/a.ts");

    expect(item.command).toBeDefined();
    expect(item.command).toBeDefined();
    expect(item.command!.command).toBe("gitWorklists.stash.openFileDiff");
    expect(item.command!.title).toBe("Open Stash Diff");
    expect(item.command!.arguments?.[0]).toMatchObject({
      kind: "stashFile",
      path: "src/a.ts",
    });
  });

  it("stashFile node: no status => no description", () => {
    const node = {
      kind: "stashFile" as const,
      stash: { ref: "stash@{1}", message: "", raw: "" },
      path: "README.md",
    };

    const item = toTreeItem(node as any);

    expect(item.label).toBe("README.md");
    expect(item.description).toBeUndefined();
  });

  it("stash node: supports 'WIP on <branch>:' format (desc=branch, label=rest)", () => {
    const item = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{0}",
        message: "WIP on feature-x: GW:abcdefgh12345678 hello",
        raw: "stash@{0}: WIP on feature-x: GW:abcdefgh12345678 hello",
      },
    } as any);

    expect(item.label).toBe("[CL:abcdefgh…] hello");
    expect(item.description).toBe("feature-x");
  });

  it("stash node: supports 'On <branch>:' format (desc=branch, label=rest)", () => {
    const item = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{1}",
        message: "On develop: GW:abcd1234 Some msg",
        raw: "stash@{1}: On develop: GW:abcd1234 Some msg",
      },
    } as any);

    expect(item.label).toBe("[CL:abcd1234] Some msg");
    expect(item.description).toBe("develop");
  });

  it("stash node: removes multiple tags (GW + CL) but preserves internal spacing", () => {
    const item = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{2}",
        message: "On main: GW:aaa111 CL:bbb222   do   stuff",
        raw: "stash@{2}: On main: GW:aaa111 CL:bbb222   do   stuff",
      },
    } as any);

    expect(item.label).toBe("[CL:aaa111] do   stuff");
    expect(item.description).toBe("main");
  });

  it("stash node: GW: without id is not treated as a tag; branch parsing still works", () => {
    const item = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{3}",
        message: "On main: GW: WIP",
        raw: "stash@{3}: On main: GW: WIP",
      },
    } as any);

    expect(item.label).toBe("GW: WIP");
    expect(item.description).toBe("main");
  });

  it("stash node: tooltip falls back to message if raw is missing", () => {
    const item = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{4}",
        message: "On main: something",
        raw: "",
      },
    } as any);

    const tip = String(item.tooltip);
    expect(tip).toContain("stash@{4}");
    expect(tip).toContain("On main: something");
  });

  it("stash node: label uses 'Stash' when message is empty or whitespace", () => {
    const item = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{5}",
        message: "   ",
        raw: "stash@{5}:   ",
      },
    } as any);

    expect(item.label).toBe("Stash");
  });

  it("stash node: shortId does not truncate when id length <= 8", () => {
    const item = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{6}",
        message: "On main: GW:12345678 msg",
        raw: "stash@{6}: On main: GW:12345678 msg",
      },
    } as any);

    expect(item.label).toBe("[CL:12345678] msg");
  });

  it("stash node: shortId truncates when id is longer than 8", () => {
    const item = toTreeItem({
      kind: "stash",
      stash: {
        ref: "stash@{7}",
        message: "On main: GW:123456789 msg",
        raw: "stash@{7}: On main: GW:123456789 msg",
      },
    } as any);

    expect(item.label).toBe("[CL:12345678…] msg");
  });
});
