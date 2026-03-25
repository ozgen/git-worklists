import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showQuickPick: vi.fn(),
  };
});

vi.mock("vscode", () => {
  return {
    window: {
      showInformationMessage: mocks.showInformationMessage,
      showWarningMessage: mocks.showWarningMessage,
      showQuickPick: mocks.showQuickPick,
    },
  };
});

import { VsCodePrompt } from "../../../../adapters/vscode/prompt";

beforeEach(() => {
  mocks.showInformationMessage.mockReset();
  mocks.showWarningMessage.mockReset();
  mocks.showQuickPick.mockReset();
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

describe("VsCodePrompt.pickBookmarkSlot", () => {
  it("shows quick pick for bookmark slots and returns picked slot", async () => {
    mocks.showQuickPick.mockResolvedValue({
      label: "Bookmark 3",
      description: "Slot 3",
      slot: 3,
    });

    const prompt = new VsCodePrompt();
    const res = await prompt.pickBookmarkSlot();

    expect(res).toBe(3);
    expect(mocks.showQuickPick).toHaveBeenCalledTimes(1);

    const [items, options] = mocks.showQuickPick.mock.calls[0] as [
      Array<{ label: string; description: string; slot: number }>,
      { placeHolder: string; ignoreFocusOut: boolean },
    ];

    expect(items).toHaveLength(9);
    expect(items[0]).toEqual({
      label: "Bookmark 1",
      description: "Slot 1",
      slot: 1,
    });
    expect(items[8]).toEqual({
      label: "Bookmark 9",
      description: "Slot 9",
      slot: 9,
    });

    expect(options).toEqual({
      placeHolder: "Select bookmark slot",
      ignoreFocusOut: true,
    });
  });

  it("returns undefined when quick pick is dismissed", async () => {
    mocks.showQuickPick.mockResolvedValue(undefined);

    const prompt = new VsCodePrompt();
    const res = await prompt.pickBookmarkSlot();

    expect(res).toBeUndefined();
  });
});

describe("VsCodePrompt.confirmBookmarkOverwrite", () => {
  it("shows modal warning and returns true when user confirms replace", async () => {
    mocks.showWarningMessage.mockResolvedValue("Replace");

    const prompt = new VsCodePrompt();
    const res = await prompt.confirmBookmarkOverwrite(
      {
        slot: 1,
        target: {
          repoRelativePath: "src/old.ts",
          line: 4,
          column: 1,
        },
      },
      {
        slot: 1,
        target: {
          repoRelativePath: "src/new.ts",
          line: 10,
          column: 3,
        },
      },
    );

    expect(res).toBe(true);
    expect(mocks.showWarningMessage).toHaveBeenCalledTimes(1);

    const [message, options, action] = mocks.showWarningMessage.mock
      .calls[0] as [string, { modal: boolean; detail: string }, string];

    expect(message).toBe("Bookmark 1 is already set.");
    expect(options.modal).toBe(true);
    expect(options.detail).toContain("Current: src/old.ts:5:2");
    expect(options.detail).toContain("New: src/new.ts:11:4");
    expect(options.detail).toContain("Do you want to replace it?");
    expect(action).toBe("Replace");
  });

  it("returns false when user cancels overwrite", async () => {
    mocks.showWarningMessage.mockResolvedValue("Cancel");

    const prompt = new VsCodePrompt();
    const res = await prompt.confirmBookmarkOverwrite(
      {
        slot: 2,
        target: {
          repoRelativePath: "src/a.ts",
          line: 0,
          column: 0,
        },
      },
      {
        slot: 2,
        target: {
          repoRelativePath: "src/b.ts",
          line: 1,
          column: 1,
        },
      },
    );

    expect(res).toBe(false);
  });

  it("returns false when overwrite dialog is dismissed", async () => {
    mocks.showWarningMessage.mockResolvedValue(undefined);

    const prompt = new VsCodePrompt();
    const res = await prompt.confirmBookmarkOverwrite(
      {
        slot: 2,
        target: {
          repoRelativePath: "src/a.ts",
          line: 0,
          column: 0,
        },
      },
      {
        slot: 2,
        target: {
          repoRelativePath: "src/b.ts",
          line: 1,
          column: 1,
        },
      },
    );

    expect(res).toBe(false);
  });
});

describe("VsCodePrompt.confirmClearAllBookmarks", () => {
  it("shows modal warning and returns true when user confirms", async () => {
    mocks.showWarningMessage.mockResolvedValue("Clear All");

    const prompt = new VsCodePrompt();
    const res = await prompt.confirmClearAllBookmarks(3);

    expect(res).toBe(true);
    expect(mocks.showWarningMessage).toHaveBeenCalledTimes(1);

    const [message, options, action] = mocks.showWarningMessage.mock
      .calls[0] as [string, { modal: boolean; detail: string }, string];

    expect(message).toBe("Clear all bookmarks?");
    expect(options).toEqual({
      modal: true,
      detail: "This will remove 3 bookmark(s) for the current repository.",
    });
    expect(action).toBe("Clear All");
  });

  it("returns false when user cancels clear all", async () => {
    mocks.showWarningMessage.mockResolvedValue("Cancel");

    const prompt = new VsCodePrompt();
    const res = await prompt.confirmClearAllBookmarks(5);

    expect(res).toBe(false);
  });

  it("returns false when clear all dialog is dismissed", async () => {
    mocks.showWarningMessage.mockResolvedValue(undefined);

    const prompt = new VsCodePrompt();
    const res = await prompt.confirmClearAllBookmarks(1);

    expect(res).toBe(false);
  });
});

describe("VsCodePrompt.showInfo", () => {
  it("forwards message to showInformationMessage", async () => {
    mocks.showInformationMessage.mockResolvedValue(undefined);

    const prompt = new VsCodePrompt();
    await prompt.showInfo("Saved");

    expect(mocks.showInformationMessage).toHaveBeenCalledWith("Saved");
  });
});

describe("VsCodePrompt.showWarning", () => {
  it("forwards message to showWarningMessage", async () => {
    mocks.showWarningMessage.mockResolvedValue(undefined);

    const prompt = new VsCodePrompt();
    await prompt.showWarning("Warning");

    expect(mocks.showWarningMessage).toHaveBeenCalledWith("Warning");
  });
});
