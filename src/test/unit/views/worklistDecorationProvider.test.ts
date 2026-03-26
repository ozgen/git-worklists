import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeMock = vi.hoisted(() => {
  class ThemeColor {
    constructor(public readonly id: string) {}
  }

  class FileDecoration {
    constructor(
      public readonly badge?: string,
      public readonly tooltip?: string,
      public readonly color?: ThemeColor,
    ) {}
  }

  class Uri {
    constructor(public readonly fsPath: string) {}
    static file(p: string) {
      return new Uri(p);
    }
  }

  class EventEmitter<T> {
    public readonly event = vi.fn();
    public fire = vi.fn((_arg?: T) => {});
    dispose() {}
  }

  return { ThemeColor, FileDecoration, Uri, EventEmitter };
});

vi.mock("vscode", () => vscodeMock);

import * as vscode from "vscode";
import {
  WorkspaceStateStore,
  type PersistedState,
} from "../../../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../../../core/changelist/systemChangelist";
import { WorklistDecorationProvider } from "../../../views/worklistDecorationProvider";

class MemMemento {
  private data = new Map<string, any>();

  get<T>(key: string): T | undefined {
    return this.data.get(key);
  }

  async update(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }
}

function state(lists: PersistedState["lists"]): PersistedState {
  return { version: 1, lists };
}

describe("WorklistDecorationProvider", () => {
  let memento: MemMemento;
  let store: WorkspaceStateStore;
  let provider: WorklistDecorationProvider;

  const repoRoot = "/repo";

  beforeEach(() => {
    vi.clearAllMocks();
    memento = new MemMemento();
    store = new WorkspaceStateStore(memento as any);
    provider = new WorklistDecorationProvider(store);
    provider.setRepoRoot(repoRoot);
  });

  it("fires change when setRepoRoot is called", () => {
    const ee = (provider as any)._onDidChange;
    expect(ee.fire).toHaveBeenCalledWith(undefined);
  });

  it("fires change when updateSnapshot is called", () => {
    const ee = (provider as any)._onDidChange;
    ee.fire.mockClear();

    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
      ]),
      fileStageStates: new Map(),
    });

    expect(ee.fire).toHaveBeenCalledWith(undefined);
  });

  it("returns undefined if repoRoot not set", async () => {
    const p = new WorklistDecorationProvider(store);
    p.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["a.txt"],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
      ]),
      fileStageStates: new Map(),
    });

    const dec = await p.provideFileDecoration(
      vscode.Uri.file("/repo/a.txt") as any,
    );
    expect(dec).toBeUndefined();
  });

  it("returns undefined if snapshot state is missing", async () => {
    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/a.txt") as any,
    );
    expect(dec).toBeUndefined();
  });

  it("returns undefined if uri is outside repo", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["a.txt"],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["b.txt"],
        },
      ]),
      fileStageStates: new Map(),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/other/a.txt") as any,
    );
    expect(dec).toBeUndefined();
  });

  it("unversioned has priority and returns U decoration", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["a.txt"],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["a.txt"],
        },
        {
          id: "cl_1",
          name: "Hotfix",
          files: ["a.txt"],
        },
      ]),
      fileStageStates: new Map(),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/a.txt") as any,
    );

    expect(dec).toBeDefined();
    expect(dec?.badge).toBe("U");
    expect(dec?.tooltip).toBe("Unversioned");
    expect(dec?.color).toBeUndefined();
  });

  it("unversioned includes staged suffix when stageState is all", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["a.txt"],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
      ]),
      fileStageStates: new Map([["a.txt", "all"]]),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/a.txt") as any,
    );

    expect(dec?.badge).toBe("U");
    expect(dec?.tooltip).toBe("Unversioned • Staged");
    expect(dec?.color).toBeUndefined();
  });

  it("unversioned includes partially staged suffix when stageState is partial", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: ["a.txt"],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
      ]),
      fileStageStates: new Map([["a.txt", "partial"]]),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/a.txt") as any,
    );

    expect(dec?.badge).toBe("U");
    expect(dec?.tooltip).toBe("Unversioned • Partially staged");
    expect(dec?.color).toBeUndefined();
  });

  it("default returns D decoration when stageState is none", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["b.txt"],
        },
      ]),
      fileStageStates: new Map(),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/b.txt") as any,
    );

    expect(dec?.badge).toBe("D");
    expect(dec?.tooltip).toBe("In Changes");
    expect(dec?.color).toBeUndefined();
  });

  it("default changelist file shows staged suffix when stageState is partial", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["b.txt"],
        },
      ]),
      fileStageStates: new Map([["b.txt", "partial"]]),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/b.txt") as any,
    );

    expect(dec?.badge).toBe("D");
    expect(dec?.tooltip).toBe("In Changes • Partially staged");
    expect(dec?.color).toBeUndefined();
  });

  it("default changelist file shows staged suffix when stageState is all", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["b.txt"],
        },
      ]),
      fileStageStates: new Map([["b.txt", "all"]]),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/b.txt") as any,
    );

    expect(dec?.badge).toBe("D");
    expect(dec?.tooltip).toBe("In Changes • Staged");
    expect(dec?.color).toBeUndefined();
  });

  it("custom returns first-letter badge and tooltip when stageState is none", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
        {
          id: "cl_x",
          name: "refactor",
          files: ["c.txt"],
        },
      ]),
      fileStageStates: new Map(),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/c.txt") as any,
    );

    expect(dec?.badge).toBe("R");
    expect(dec?.tooltip).toBe("In refactor");
    expect(dec?.color).toBeUndefined();
  });

  it("custom badge falls back to L for empty names", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
        {
          id: "cl_x",
          name: "   ",
          files: ["d.txt"],
        },
      ]),
      fileStageStates: new Map(),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/d.txt") as any,
    );

    expect(dec?.badge).toBe("L");
    expect(dec?.tooltip).toBe("In    ");
    expect(dec?.color).toBeUndefined();
  });

  it("custom changelist file shows staged suffix when stageState is all", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
        {
          id: "cl_x",
          name: "refactor",
          files: ["c.txt"],
        },
      ]),
      fileStageStates: new Map([["c.txt", "all"]]),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/c.txt") as any,
    );

    expect(dec?.badge).toBe("R");
    expect(dec?.tooltip).toBe("In refactor • Staged");
    expect(dec?.color).toBeUndefined();
  });

  it("custom changelist file shows partially staged suffix when stageState is partial", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
        {
          id: "cl_x",
          name: "refactor",
          files: ["c.txt"],
        },
      ]),
      fileStageStates: new Map([["c.txt", "partial"]]),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/c.txt") as any,
    );

    expect(dec?.badge).toBe("R");
    expect(dec?.tooltip).toBe("In refactor • Partially staged");
    expect(dec?.color).toBeUndefined();
  });

  it("returns undefined if file not in any list", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: [],
        },
        {
          id: "cl_x",
          name: "X",
          files: ["x.txt"],
        },
      ]),
      fileStageStates: new Map(),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/nope.txt") as any,
    );
    expect(dec).toBeUndefined();
  });

  it("ignores invalid snapshot state", async () => {
    provider.updateSnapshot({
      state: { version: 999 },
      fileStageStates: new Map(),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/a.txt") as any,
    );

    expect(dec).toBeUndefined();
  });

  it("normalizes stage-state paths from snapshot", async () => {
    provider.updateSnapshot({
      state: state([
        {
          id: SystemChangelist.Unversioned,
          name: "Unversioned",
          files: [],
        },
        {
          id: SystemChangelist.Default,
          name: "Changes",
          files: ["dir/file.txt"],
        },
      ]),
      fileStageStates: new Map([["dir\\file.txt", "all"]]),
    });

    const dec = await provider.provideFileDecoration(
      vscode.Uri.file("/repo/dir/file.txt") as any,
    );

    expect(dec?.badge).toBe("D");
    expect(dec?.tooltip).toBe("In Changes • Staged");
  });
});
