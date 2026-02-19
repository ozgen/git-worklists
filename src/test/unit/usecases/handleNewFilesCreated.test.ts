import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    normalizeRepoRelPath: vi.fn(),
  };
});

vi.mock("../../../utils/paths", () => {
  return {
    normalizeRepoRelPath: mocks.normalizeRepoRelPath,
  };
});

import { PendingStageOnSave } from "../../../adapters/vscode/pendingStageOnSave";

beforeEach(() => {
  mocks.normalizeRepoRelPath.mockReset();
});

describe("PendingStageOnSave", () => {
  it("returns false when consuming from an unknown repo", () => {
    mocks.normalizeRepoRelPath.mockImplementation((p: string) => p);
  
    const sut = new PendingStageOnSave();
  
    expect(sut.consume("/repo-a", "a.txt")).toBe(false);
  
    expect(mocks.normalizeRepoRelPath).not.toHaveBeenCalled();
  });
  
  it("returns false when consuming a path that was never marked", () => {
    mocks.normalizeRepoRelPath.mockImplementation((p: string) => p);

    const sut = new PendingStageOnSave();
    sut.mark("/repo-a", "a.txt");

    expect(sut.consume("/repo-a", "b.txt")).toBe(false);
  });

  it("marks and then consumes the same normalized path (true once)", () => {
    mocks.normalizeRepoRelPath.mockImplementation((p: string) =>
      p.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+/g, "/"),
    );

    const sut = new PendingStageOnSave();

    sut.mark("/repo-a", "./dir\\file.txt"); 

    expect(sut.consume("/repo-a", "dir/file.txt")).toBe(true);
    expect(sut.consume("/repo-a", "dir/file.txt")).toBe(false);
  });

  it("is isolated per repo root", () => {
    mocks.normalizeRepoRelPath.mockImplementation((p: string) => p);

    const sut = new PendingStageOnSave();

    sut.mark("/repo-a", "a.txt");

    expect(sut.consume("/repo-b", "a.txt")).toBe(false);
    expect(sut.consume("/repo-a", "a.txt")).toBe(true);
  });

  it("supports multiple pending paths per repo and consumes independently", () => {
    mocks.normalizeRepoRelPath.mockImplementation((p: string) => p);

    const sut = new PendingStageOnSave();

    sut.mark("/repo-a", "a.txt");
    sut.mark("/repo-a", "b.txt");

    expect(sut.consume("/repo-a", "a.txt")).toBe(true);
    expect(sut.consume("/repo-a", "a.txt")).toBe(false);

    expect(sut.consume("/repo-a", "b.txt")).toBe(true);
    expect(sut.consume("/repo-a", "b.txt")).toBe(false);
  });

  it("cleans up repo entry when the last pending path is consumed (behavioral check)", () => {
    mocks.normalizeRepoRelPath.mockImplementation((p: string) => p);

    const sut = new PendingStageOnSave();

    sut.mark("/repo-a", "a.txt");
    expect(sut.consume("/repo-a", "a.txt")).toBe(true);

    expect(sut.consume("/repo-a", "a.txt")).toBe(false);
    expect(sut.consume("/repo-a", "other.txt")).toBe(false);
  });

  it("treats multiple marks of the same normalized path as one (Set semantics)", () => {
    mocks.normalizeRepoRelPath.mockImplementation((p: string) =>
      p.replace(/^\.\/+/, ""),
    );

    const sut = new PendingStageOnSave();

    sut.mark("/repo-a", "a.txt");
    sut.mark("/repo-a", "./a.txt");

    expect(sut.consume("/repo-a", "a.txt")).toBe(true);
    expect(sut.consume("/repo-a", "a.txt")).toBe(false);
  });

  it("calls normalizeRepoRelPath in both mark() and consume()", () => {
    mocks.normalizeRepoRelPath.mockImplementation((p: string) => p);

    const sut = new PendingStageOnSave();

    sut.mark("/repo-a", "a.txt");
    sut.consume("/repo-a", "a.txt");

    expect(mocks.normalizeRepoRelPath).toHaveBeenNthCalledWith(1, "a.txt");
    expect(mocks.normalizeRepoRelPath).toHaveBeenNthCalledWith(2, "a.txt");
  });
});
