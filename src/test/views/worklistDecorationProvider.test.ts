import { describe, it, expect, vi, beforeEach } from "vitest";

// --- hoisted vscode mock ---
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
    public readonly event = vi.fn(); // we don’t need actual Event behavior here
    public fire = vi.fn((_arg?: T) => {});
    dispose() {}
  }

  return { ThemeColor, FileDecoration, Uri, EventEmitter };
});

vi.mock("vscode", () => vscodeMock);

import * as vscode from "vscode";
import { WorklistDecorationProvider } from "../../views/worklistDecorationProvider";
import {
  WorkspaceStateStore,
  type PersistedState,
} from "../../adapters/storage/workspaceStateStore";
import { SystemChangelist } from "../../core/changelist/systemChangelist";

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
  const keyRepo = repoRoot; 

  beforeEach(() => {
    vi.clearAllMocks();
    memento = new MemMemento();
    store = new WorkspaceStateStore(memento as any);
    provider = new WorklistDecorationProvider(store);
    provider.setRepoRoot(repoRoot);
  });

  it("fires change when setRepoRoot is called", () => {
    const ee = (provider as any)._onDidChange;
    expect(ee.fire).toHaveBeenCalledWith([]);
  });

  it("refreshAll fires change", () => {
    const ee = (provider as any)._onDidChange;
    ee.fire.mockClear();

    provider.refreshAll();
    expect(ee.fire).toHaveBeenCalledWith([]);
  });

  it("returns undefined if repoRoot not set", async () => {
    const p = new WorklistDecorationProvider(store);
    const dec = await p.provideFileDecoration(vscode.Uri.file("/repo/a.txt") as any);
    expect(dec).toBeUndefined();
  });

  it("returns undefined if state missing", async () => {
    const dec = await provider.provideFileDecoration(vscode.Uri.file("/repo/a.txt") as any);
    expect(dec).toBeUndefined();
  });

  it("returns undefined if uri is outside repo", async () => {
    await store.save(
      keyRepo,
      state([
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: ["a.txt"] },
        { id: SystemChangelist.Default, name: "Changes", files: ["b.txt"] },
      ]),
    );

    const dec = await provider.provideFileDecoration(vscode.Uri.file("/other/a.txt") as any);
    expect(dec).toBeUndefined();
  });

  it("unversioned has priority and returns U decoration", async () => {
    await store.save(
      keyRepo,
      state([
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: ["a.txt"] },
        { id: SystemChangelist.Default, name: "Changes", files: ["a.txt"] },
        { id: "cl_1", name: "Hotfix", files: ["a.txt"] }, 
      ]),
    );

    const dec = await provider.provideFileDecoration(vscode.Uri.file("/repo/a.txt") as any);

    expect(dec).toBeDefined();
    expect(dec?.badge).toBe("U");
    expect(dec?.tooltip).toBe("Unversioned");
    expect(dec?.color).toMatchObject({ id: "gitDecoration.untrackedResourceForeground" });
  });

  it("default returns D decoration", async () => {
    await store.save(
      keyRepo,
      state([
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: ["b.txt"] },
      ]),
    );

    const dec = await provider.provideFileDecoration(vscode.Uri.file("/repo/b.txt") as any);

    expect(dec?.badge).toBe("D");
    expect(dec?.tooltip).toBe("In Changes");
    expect(dec?.color).toMatchObject({ id: "gitDecoration.modifiedResourceForeground" });
  });

  it("custom returns first-letter badge and tooltip", async () => {
    await store.save(
      keyRepo,
      state([
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_x", name: "refactor", files: ["c.txt"] },
      ]),
    );

    const dec = await provider.provideFileDecoration(vscode.Uri.file("/repo/c.txt") as any);

    expect(dec?.badge).toBe("R");
    expect(dec?.tooltip).toBe("In refactor");
    expect(dec?.color).toMatchObject({ id: "gitDecoration.addedResourceForeground" });
  });

  it("custom badge falls back to L for empty/invalid names", async () => {
    await store.save(
      keyRepo,
      state([
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_x", name: "   ", files: ["d.txt"] },
      ]),
    );

    const dec = await provider.provideFileDecoration(vscode.Uri.file("/repo/d.txt") as any);
    expect(dec?.badge).toBe("L");
    expect(dec?.tooltip).toBe("In    "); 
  });

  it("returns undefined if file not in any list", async () => {
    await store.save(
      keyRepo,
      state([
        { id: SystemChangelist.Unversioned, name: "Unversioned", files: [] },
        { id: SystemChangelist.Default, name: "Changes", files: [] },
        { id: "cl_x", name: "X", files: ["x.txt"] },
      ]),
    );

    const dec = await provider.provideFileDecoration(vscode.Uri.file("/repo/nope.txt") as any);
    expect(dec).toBeUndefined();
  });
});
