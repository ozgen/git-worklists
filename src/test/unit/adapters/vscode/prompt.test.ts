import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    showInformationMessage: vi.fn(),
  };
});

vi.mock("vscode", () => {
  return {
    window: {
      showInformationMessage: mocks.showInformationMessage,
    },
  };
});

import { VsCodePrompt } from "../../../../adapters/vscode/prompt";

beforeEach(() => {
  mocks.showInformationMessage.mockReset();
});

describe("VsCodePrompt.confirmAddNewFiles", () => {
  it("shows single-file message with sample (trimmed) and returns add", async () => {
    mocks.showInformationMessage.mockResolvedValue("Add");

    const prompt = new VsCodePrompt();
    const res = await prompt.confirmAddNewFiles(1, "src/a.ts");

    expect(res).toBe("add");
    expect(mocks.showInformationMessage).toHaveBeenCalledTimes(1);

    const [msg, b1, b2, b3] = mocks.showInformationMessage.mock.calls[0] as [
      string,
      string,
      string,
      string,
    ];

    expect(msg).toBe("Add to Git?\nsrc/a.ts");
    expect([b1, b2, b3]).toEqual(["Add", "Keep Unversioned", "Disable prompt"]);
  });

  it("shows single-file message without sample (no trailing newline) and returns keep", async () => {
    mocks.showInformationMessage.mockResolvedValue("Keep Unversioned");

    const prompt = new VsCodePrompt();
    const res = await prompt.confirmAddNewFiles(1);

    expect(res).toBe("keep");

    const [msg] = mocks.showInformationMessage.mock.calls[0] as [string];
    expect(msg).toBe("Add to Git?");
  });

  it("shows multi-file message and returns disable", async () => {
    mocks.showInformationMessage.mockResolvedValue("Disable prompt");

    const prompt = new VsCodePrompt();
    const res = await prompt.confirmAddNewFiles(3);

    expect(res).toBe("disable");

    const [msg] = mocks.showInformationMessage.mock.calls[0] as [string];
    expect(msg).toBe("Add 3 new files to Git?");
  });

  it("returns dismiss when user closes the message (undefined)", async () => {
    mocks.showInformationMessage.mockResolvedValue(undefined);

    const prompt = new VsCodePrompt();
    const res = await prompt.confirmAddNewFiles(2);

    expect(res).toBe("dismiss");
  });
});
