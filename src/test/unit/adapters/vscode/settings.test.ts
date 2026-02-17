import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    getConfiguration: vi.fn(),
    configGet: vi.fn(),
    configUpdate: vi.fn(),
    ConfigurationTarget: { Global: 1 },
  };
});

vi.mock("vscode", () => {
  return {
    workspace: {
      getConfiguration: mocks.getConfiguration,
    },
    ConfigurationTarget: mocks.ConfigurationTarget,
  };
});

import { VsCodeSettings } from "../../../../adapters/vscode/settings";

beforeEach(() => {
  mocks.getConfiguration.mockReset();
  mocks.configGet.mockReset();
  mocks.configUpdate.mockReset();

  mocks.getConfiguration.mockReturnValue({
    get: mocks.configGet,
    update: mocks.configUpdate,
  });
});

describe("VsCodeSettings", () => {
  describe("getPromptOnNewFile", () => {
    it("reads gitWorklists.promptOnNewFile with default true", () => {
      mocks.configGet.mockReturnValue(true);

      const s = new VsCodeSettings();
      const v = s.getPromptOnNewFile();

      expect(v).toBe(true);
      expect(mocks.getConfiguration).toHaveBeenCalledWith("gitWorklists");
      expect(mocks.configGet).toHaveBeenCalledWith("promptOnNewFile", true);
    });

    it("returns false when configuration value is false", () => {
      mocks.configGet.mockReturnValue(false);

      const s = new VsCodeSettings();
      const v = s.getPromptOnNewFile();

      expect(v).toBe(false);
      expect(mocks.configGet).toHaveBeenCalledWith("promptOnNewFile", true);
    });
  });

  describe("setPromptOnNewFile", () => {
    it("updates gitWorklists.promptOnNewFile in Global scope", async () => {
      mocks.configUpdate.mockResolvedValue(undefined);

      const s = new VsCodeSettings();
      await s.setPromptOnNewFile(false);

      expect(mocks.getConfiguration).toHaveBeenCalledWith("gitWorklists");
      expect(mocks.configUpdate).toHaveBeenCalledWith(
        "promptOnNewFile",
        false,
        1,
      );
    });
  });

  describe("closeDiffTabsAfterCommit", () => {
    it("reads gitWorklists.ui.closeDiffTabsAfterCommit with default false", () => {
      mocks.configGet.mockReturnValue(false);

      const s = new VsCodeSettings();
      const v = s.closeDiffTabsAfterCommit();

      expect(v).toBe(false);
      expect(mocks.getConfiguration).toHaveBeenCalledWith("gitWorklists");
      expect(mocks.configGet).toHaveBeenCalledWith(
        "ui.closeDiffTabsAfterCommit",
        false,
      );
    });

    it("returns true when configuration value is true", () => {
      mocks.configGet.mockReturnValue(true);

      const s = new VsCodeSettings();
      const v = s.closeDiffTabsAfterCommit();

      expect(v).toBe(true);
      expect(mocks.configGet).toHaveBeenCalledWith(
        "ui.closeDiffTabsAfterCommit",
        false,
      );
    });
  });

  describe("closeDiffTabsAfterPush", () => {
    it("reads gitWorklists.ui.closeDiffTabsAfterPush with default false", () => {
      mocks.configGet.mockReturnValue(false);

      const s = new VsCodeSettings();
      const v = s.closeDiffTabsAfterPush();

      expect(v).toBe(false);
      expect(mocks.getConfiguration).toHaveBeenCalledWith("gitWorklists");
      expect(mocks.configGet).toHaveBeenCalledWith(
        "ui.closeDiffTabsAfterPush",
        false,
      );
    });

    it("returns true when configuration value is true", () => {
      mocks.configGet.mockReturnValue(true);

      const s = new VsCodeSettings();
      const v = s.closeDiffTabsAfterPush();

      expect(v).toBe(true);
      expect(mocks.configGet).toHaveBeenCalledWith(
        "ui.closeDiffTabsAfterPush",
        false,
      );
    });
  });
});
