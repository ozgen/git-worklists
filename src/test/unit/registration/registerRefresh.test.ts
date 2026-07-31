import { describe, it, expect, vi } from "vitest";

const vscodeMock = vi.hoisted(() => {
  return {
    window: {
      withProgress: vi.fn(async (_opts: unknown, task: () => Promise<void>) => {
        return task();
      }),
    },
    ProgressLocation: { Window: 10 },
  };
});

vi.mock("vscode", () => vscodeMock);

import { registerRefresh } from "../../../registration/registerRefresh";
import { RenameMapping } from "../../../core/rename/renameMapping";
import { StagePaths } from "../../../usecases/stagePaths";

describe("registerRefresh — command ordering", () => {
  it("runs a rename-aware staging operation, then reconcile, before any tree/decoration refresh", async () => {
    const callLog: string[] = [];

    const git = {
      stageRename: vi.fn(async () => {
        callLog.push("git.stageRename");
      }),
      stageMany: vi.fn(async () => {}),
      getFileStageStates: vi.fn(async () => {
        callLog.push("git.getFileStageStates");
        return new Map();
      }),
    };

    const renameMapping = new RenameMapping();
    renameMapping.record("/repo", "old.ts", "new.ts");
    const stagePaths = new StagePaths(git as any, renameMapping);

    const deps: any = {
      context: { subscriptions: { push: vi.fn() } },
      repoRoot: "/repo",
      git,
      store: {
        load: vi.fn(async () => {
          callLog.push("store.load");
          return { version: 1, lists: [] };
        }),
      },
      loadOrInit: {
        run: vi.fn(async () => {
          callLog.push("loadOrInit.run");
        }),
      },
      reconcile: {
        run: vi.fn(async () => {
          callLog.push("reconcile.run");
        }),
      },
      treeProvider: {
        setFileStageStates: vi.fn(() => {
          callLog.push("treeProvider.setFileStageStates");
        }),
        refresh: vi.fn(() => {
          callLog.push("treeProvider.refresh");
        }),
      },
      deco: {
        updateSnapshot: vi.fn(() => {
          callLog.push("deco.updateSnapshot");
        }),
      },
      treeView: {},
      commitView: undefined,
    };

    const { doRefresh } = registerRefresh(deps);

    // Mirrors every real command handler's shape: await the rename-aware
    // usecase, then request a refresh.
    await stagePaths.run("/repo", ["new.ts"]);
    await doRefresh();

    expect(callLog).toEqual([
      "git.stageRename",
      "loadOrInit.run",
      "reconcile.run",
      "store.load",
      "git.getFileStageStates",
      "treeProvider.setFileStageStates",
      "deco.updateSnapshot",
      "treeProvider.refresh",
    ]);
  });
});
