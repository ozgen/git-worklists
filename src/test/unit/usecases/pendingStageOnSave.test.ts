import { describe, it, expect, vi, beforeEach } from "vitest";

import { PendingStageOnSave } from "../../../adapters/vscode/pendingStageOnSave";

vi.mock("../../../utils/paths", () => {
  return {
    normalizeRepoRelPath: (p: string) =>
      p.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+/g, "/"),
  };
});

describe("PendingStageOnSave", () => {
  let sut: PendingStageOnSave;

  beforeEach(() => {
    sut = new PendingStageOnSave();
  });

  it("returns false when consuming from an unknown repo", () => {
    expect(sut.consume("/repo-a", "a.txt")).toBe(false);
  });

  it("returns false when consuming a path that was never marked", () => {
    sut.mark("/repo-a", "a.txt");
    expect(sut.consume("/repo-a", "b.txt")).toBe(false);
  });

  it("marks and then consumes the same normalized path (returns true once)", () => {
    sut.mark("/repo-a", "./dir\\file.txt");

    expect(sut.consume("/repo-a", "dir/file.txt")).toBe(true);
    expect(sut.consume("/repo-a", "dir/file.txt")).toBe(false); 
  });

  it("is isolated per repo root", () => {
    sut.mark("/repo-a", "a.txt");

    expect(sut.consume("/repo-b", "a.txt")).toBe(false);
    expect(sut.consume("/repo-a", "a.txt")).toBe(true);
  });

  it("supports multiple pending paths per repo and consumes independently", () => {
    sut.mark("/repo-a", "a.txt");
    sut.mark("/repo-a", "b.txt");

    expect(sut.consume("/repo-a", "a.txt")).toBe(true);
    expect(sut.consume("/repo-a", "a.txt")).toBe(false);

    expect(sut.consume("/repo-a", "b.txt")).toBe(true);
    expect(sut.consume("/repo-a", "b.txt")).toBe(false);
  });

  it("does not affect other pending paths when consuming one", () => {
    sut.mark("/repo-a", "a.txt");
    sut.mark("/repo-a", "b.txt");

    expect(sut.consume("/repo-a", "a.txt")).toBe(true);
    expect(sut.consume("/repo-a", "b.txt")).toBe(true);
  });

  it("cleans up repo entry when the last pending path is consumed", () => {
    sut.mark("/repo-a", "a.txt");

    expect(sut.consume("/repo-a", "a.txt")).toBe(true);

    expect(sut.consume("/repo-a", "a.txt")).toBe(false);
    expect(sut.consume("/repo-a", "other.txt")).toBe(false);
  });

  it("allows marking the same path multiple times but consumes only once (Set behavior)", () => {
    sut.mark("/repo-a", "a.txt");
    sut.mark("/repo-a", "./a.txt"); 

    expect(sut.consume("/repo-a", "a.txt")).toBe(true);
    expect(sut.consume("/repo-a", "a.txt")).toBe(false);
  });
});
