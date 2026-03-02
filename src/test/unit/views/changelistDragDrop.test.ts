import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChangelistDragDrop } from "../../../views/changelistDragDrop";

vi.mock("vscode", () => ({
  TreeItem: class {},
  TreeItemCollapsibleState: { None: 0, Expanded: 2 },
  ThemeIcon: class {},
  DataTransferItem: class {
    private value: string;
    constructor(v: string) { this.value = v; }
    asString() { return Promise.resolve(this.value); }
  },
}));

vi.mock("../../../views/changelistTreeProvider", () => {
  class GroupNode {
    readonly kind = "group" as const;
    constructor(public readonly list: { id: string; name: string; files: string[] }) {}
  }
  class FileNode {
    readonly kind = "file" as const;
    constructor(public readonly repoRelativePath: string) {}
  }
  return { GroupNode, FileNode };
});

import { GroupNode, FileNode } from "../../../views/changelistTreeProvider";

function makeMoveFiles() {
  return { run: vi.fn(async () => {}) };
}

function makeTransfer(payloadStr?: string) {
  const map = new Map<string, { asString: () => Promise<string> }>();
  if (payloadStr !== undefined) {
    map.set("application/vnd.git-worklists.nodes", {
      asString: () => Promise.resolve(payloadStr),
    });
  }
  return {
    set: vi.fn((mime: string, item: any) => map.set(mime, item)),
    get: (mime: string) => map.get(mime),
  };
}

describe("ChangelistDragDrop", () => {
  beforeEach(() => vi.restoreAllMocks());

  describe("handleDrag", () => {
    it("serializes FileNode paths into the data transfer", () => {
      const dnd = new ChangelistDragDrop(makeMoveFiles() as any, () => "/repo", async () => {});
      const transfer = makeTransfer();
      const file = new (FileNode as any)("src/a.ts");

      dnd.handleDrag([file], transfer as any);

      expect(transfer.set).toHaveBeenCalledTimes(1);
      const [mime, item] = (transfer.set as any).mock.calls[0];
      expect(mime).toBe("application/vnd.git-worklists.nodes");
      const payload = JSON.parse(item.value ?? item._value ?? "[]");
      expect(payload).toEqual([{ kind: "file", path: "src/a.ts" }]);
    });

    it("serializes GroupNode with listId and files", () => {
      const dnd = new ChangelistDragDrop(makeMoveFiles() as any, () => "/repo", async () => {});
      const transfer = makeTransfer();
      const group = new (GroupNode as any)({ id: "cl_1", name: "Feature", files: ["a.ts", "b.ts"] });

      dnd.handleDrag([group], transfer as any);

      const [, item] = (transfer.set as any).mock.calls[0];
      const payload = JSON.parse(item.value ?? item._value ?? "[]");
      expect(payload).toEqual([{ kind: "group", listId: "cl_1", files: ["a.ts", "b.ts"] }]);
    });
  });

  describe("handleDrop", () => {
    it("does nothing when target is not a GroupNode", async () => {
      const moveFiles = makeMoveFiles();
      const dnd = new ChangelistDragDrop(moveFiles as any, () => "/repo", async () => {});
      const file = new (FileNode as any)("a.ts");

      await dnd.handleDrop(file as any, makeTransfer() as any);

      expect(moveFiles.run).not.toHaveBeenCalled();
    });

    it("does nothing when data transfer has no matching MIME", async () => {
      const moveFiles = makeMoveFiles();
      const dnd = new ChangelistDragDrop(moveFiles as any, () => "/repo", async () => {});
      const target = new (GroupNode as any)({ id: "cl_1", name: "A", files: [] });

      await dnd.handleDrop(target as any, makeTransfer() as any);

      expect(moveFiles.run).not.toHaveBeenCalled();
    });

    it("moves dragged file to target group", async () => {
      const moveFiles = makeMoveFiles();
      const onDrop = vi.fn(async () => {});
      const dnd = new ChangelistDragDrop(moveFiles as any, () => "/repo", onDrop);

      const payload = JSON.stringify([{ kind: "file", path: "src/a.ts" }]);
      const target = new (GroupNode as any)({ id: "cl_2", name: "Target", files: [] });

      await dnd.handleDrop(target as any, makeTransfer(payload) as any);

      expect(moveFiles.run).toHaveBeenCalledWith("/repo", ["src/a.ts"], "cl_2");
      expect(onDrop).toHaveBeenCalledTimes(1);
    });

    it("normalizes backslashes in file paths", async () => {
      const moveFiles = makeMoveFiles();
      const dnd = new ChangelistDragDrop(moveFiles as any, () => "/repo", async () => {});

      const payload = JSON.stringify([{ kind: "file", path: "src\\a.ts" }]);
      const target = new (GroupNode as any)({ id: "cl_2", name: "Target", files: [] });

      await dnd.handleDrop(target as any, makeTransfer(payload) as any);

      expect(moveFiles.run).toHaveBeenCalledWith("/repo", ["src/a.ts"], "cl_2");
    });

    it("moves all files from a dragged group to the target", async () => {
      const moveFiles = makeMoveFiles();
      const dnd = new ChangelistDragDrop(moveFiles as any, () => "/repo", async () => {});

      const payload = JSON.stringify([{ kind: "group", listId: "cl_1", files: ["a.ts", "b.ts"] }]);
      const target = new (GroupNode as any)({ id: "cl_2", name: "Target", files: [] });

      await dnd.handleDrop(target as any, makeTransfer(payload) as any);

      expect(moveFiles.run).toHaveBeenCalledWith("/repo", ["a.ts", "b.ts"], "cl_2");
    });

    it("skips group drag when source and target are the same list", async () => {
      const moveFiles = makeMoveFiles();
      const dnd = new ChangelistDragDrop(moveFiles as any, () => "/repo", async () => {});

      const payload = JSON.stringify([{ kind: "group", listId: "cl_1", files: ["a.ts"] }]);
      const target = new (GroupNode as any)({ id: "cl_1", name: "Same", files: ["a.ts"] });

      await dnd.handleDrop(target as any, makeTransfer(payload) as any);

      expect(moveFiles.run).not.toHaveBeenCalled();
    });

    it("handles mixed file and group payloads", async () => {
      const moveFiles = makeMoveFiles();
      const dnd = new ChangelistDragDrop(moveFiles as any, () => "/repo", async () => {});

      const payload = JSON.stringify([
        { kind: "file", path: "x.ts" },
        { kind: "group", listId: "cl_1", files: ["a.ts", "b.ts"] },
      ]);
      const target = new (GroupNode as any)({ id: "cl_2", name: "Target", files: [] });

      await dnd.handleDrop(target as any, makeTransfer(payload) as any);

      expect(moveFiles.run).toHaveBeenCalledWith("/repo", ["x.ts", "a.ts", "b.ts"], "cl_2");
    });
  });
});
