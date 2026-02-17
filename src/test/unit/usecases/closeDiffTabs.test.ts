import { describe, it, expect, vi } from "vitest";
import { CloseDiffTabs } from "../../../usecases/closeDiffTabs";

describe("CloseDiffTabs", () => {
  it("calls tracker.closeTrackedTabs()", async () => {
    const tracker = {
      closeTrackedTabs: vi.fn(async () => {}),
    };

    const uc = new CloseDiffTabs(tracker as any);

    await uc.run();

    expect(tracker.closeTrackedTabs).toHaveBeenCalledTimes(1);
  });

  it("propagates errors from tracker.closeTrackedTabs()", async () => {
    const err = new Error("boom");
    const tracker = {
      closeTrackedTabs: vi.fn(async () => {
        throw err;
      }),
    };

    const uc = new CloseDiffTabs(tracker as any);

    await expect(uc.run()).rejects.toThrow("boom");
    expect(tracker.closeTrackedTabs).toHaveBeenCalledTimes(1);
  });
});
