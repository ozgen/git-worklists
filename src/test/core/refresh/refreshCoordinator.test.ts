import { describe, it, expect, vi } from "vitest";
import { RefreshCoordinator } from "../../../core/refresh/refreshCoordinator";

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("RefreshCoordinator", () => {
  it("debounces multiple triggers into one refresh", async () => {
    const refreshFn = vi.fn().mockResolvedValue(undefined);
    const c = new RefreshCoordinator(refreshFn, 20);

    c.trigger();
    c.trigger();
    c.trigger();

    await wait(35);
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });

  it("serializes: if trigger happens during refresh, it runs again once", async () => {
    let resolve!: () => void;
    const refreshFn = vi.fn().mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );

    const c = new RefreshCoordinator(refreshFn, 0);

    c.requestNow();
    await wait(0);

    c.trigger();
    resolve();
    await wait(0);

    expect(refreshFn).toHaveBeenCalledTimes(2);
  });

  it("dispose clears pending timer", async () => {
    const refreshFn = vi.fn().mockResolvedValue(undefined);
    const c = new RefreshCoordinator(refreshFn, 50);

    c.trigger();
    c.dispose();

    await wait(70);
    expect(refreshFn).toHaveBeenCalledTimes(0);
  });
});
