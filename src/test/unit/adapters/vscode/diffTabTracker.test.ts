import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("vscode", () => {
  const state = {
    groups: [] as any[],
    closeMock: vi.fn(async (_tabs: any[], _preserveFocus: boolean) => {}),
  };

  return {
    window: {
      tabGroups: {
        get all() {
          return state.groups;
        },
        close: state.closeMock,
      },
    },

    __test: state,
  };
});

import * as vscode from "vscode";
import { DiffTabTracker } from "../../../../adapters/vscode/diffTabTracker";

type FakeUri = { toString(): string };
type FakeTabInput = { modified?: FakeUri; original?: FakeUri; uri?: FakeUri };
type FakeTab = { input?: FakeTabInput };
type FakeTabGroup = { tabs: FakeTab[] };

function uri(s: string): FakeUri {
  return { toString: () => s };
}

function tabWithInput(input: FakeTabInput): FakeTab {
  return { input };
}

function setGroups(groups: FakeTabGroup[]) {
  (vscode as any).__test.groups = groups;
}

function closeMock() {
  return (vscode as any).__test.closeMock as ReturnType<typeof vi.fn>;
}

describe("DiffTabTracker", () => {
  beforeEach(() => {
    closeMock().mockClear();
    setGroups([]);
  });

  it("does nothing when nothing is tracked", async () => {
    const tracker = new DiffTabTracker();

    await tracker.closeTrackedTabs();

    expect(closeMock()).not.toHaveBeenCalled();
  });

  it("closes tabs whose input.modified matches a tracked uri", async () => {
    const tracker = new DiffTabTracker();

    const tracked = uri("file:///repo/a.txt");
    const other = uri("file:///repo/b.txt");

    setGroups([{ tabs: [tabWithInput({ modified: tracked }), tabWithInput({ modified: other })] }]);

    tracker.track(tracked as any);

    await tracker.closeTrackedTabs();

    expect(closeMock()).toHaveBeenCalledTimes(1);
    const [tabs, preserveFocus] = closeMock().mock.calls[0]!;
    expect(preserveFocus).toBe(true);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].input.modified.toString()).toBe("file:///repo/a.txt");

    closeMock().mockClear();
    await tracker.closeTrackedTabs();
    expect(closeMock()).not.toHaveBeenCalled();
  });

  it("closes tabs whose input.original matches a tracked uri", async () => {
    const tracker = new DiffTabTracker();

    const tracked = uri("gitshow:///HEAD/a.txt");
    const other = uri("gitshow:///HEAD/b.txt");

    setGroups([{ tabs: [tabWithInput({ original: tracked }), tabWithInput({ original: other })] }]);

    tracker.track(tracked as any);

    await tracker.closeTrackedTabs();

    expect(closeMock()).toHaveBeenCalledTimes(1);
    const [tabs] = closeMock().mock.calls[0]!;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].input.original.toString()).toBe("gitshow:///HEAD/a.txt");
  });

  it("closes tabs whose input.uri matches a tracked uri (non-diff tab)", async () => {
    const tracker = new DiffTabTracker();

    const tracked = uri("file:///repo/readme.md");

    setGroups([{ tabs: [tabWithInput({ uri: tracked })] }]);

    tracker.track(tracked as any);

    await tracker.closeTrackedTabs();

    expect(closeMock()).toHaveBeenCalledTimes(1);
    const [tabs] = closeMock().mock.calls[0]!;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].input.uri.toString()).toBe("file:///repo/readme.md");
  });

  it("closes matching tabs across multiple groups", async () => {
    const tracker = new DiffTabTracker();

    const a = uri("file:///repo/a.txt");
    const b = uri("file:///repo/b.txt");
    const c = uri("file:///repo/c.txt");

    setGroups([
      { tabs: [tabWithInput({ modified: a }), tabWithInput({ modified: c })] },
      { tabs: [tabWithInput({ original: b }), tabWithInput({ uri: c })] },
    ]);

    tracker.track(a as any);
    tracker.track(b as any);
    tracker.track(c as any);

    await tracker.closeTrackedTabs();

    expect(closeMock()).toHaveBeenCalledTimes(1);
    const [tabs] = closeMock().mock.calls[0]!;
    expect(tabs).toHaveLength(4);
  });

  it("does not call close if nothing matches, but clears tracked set", async () => {
    const tracker = new DiffTabTracker();

    const tracked = uri("file:///repo/tracked.txt");
    const other = uri("file:///repo/other.txt");

    setGroups([{ tabs: [tabWithInput({ modified: other })] }]);

    tracker.track(tracked as any);

    await tracker.closeTrackedTabs();

    expect(closeMock()).not.toHaveBeenCalled();

    // cleared -> second call no-op
    closeMock().mockClear();
    await tracker.closeTrackedTabs();
    expect(closeMock()).not.toHaveBeenCalled();
  });

  it("clear() removes tracked uris", async () => {
    const tracker = new DiffTabTracker();

    const tracked = uri("file:///repo/a.txt");
    setGroups([{ tabs: [tabWithInput({ modified: tracked })] }]);

    tracker.track(tracked as any);
    tracker.clear();

    await tracker.closeTrackedTabs();

    expect(closeMock()).not.toHaveBeenCalled();
  });
});
