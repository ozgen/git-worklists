import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vscodeMock = vi.hoisted(() => {
  class Uri {
    constructor(public readonly fsPath: string) {}
    static file(fsPath: string) {
      return new Uri(fsPath);
    }
  }

  return {
    Uri,
    commands: {
      registerCommand: vi.fn(
        (_command: string, _handler: (arg: any) => Promise<void>) => ({
          dispose: vi.fn(),
        }),
      ),
    },
    window: { showErrorMessage: vi.fn() },
  };
});

vi.mock("vscode", () => vscodeMock);

import { registerCommands } from "../../../registration/registerCommands";

describe("single-file staging commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("process", { ...process, platform: "win32" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["gitWorklists.selectFile", "stagePaths"],
    ["gitWorklists.unselectFile", "unstagePaths"],
  ] as const)("%s handles tree nodes and URIs with different drive casing", async (command, operation) => {
    const deps: any = {
      context: { subscriptions: [] },
      repoRoot: "C:/Users/Test/repo",
      stagePaths: { run: vi.fn(async () => {}) },
      unstagePaths: { run: vi.fn(async () => {}) },
      coordinator: { requestNow: vi.fn(async () => {}) },
    };
    registerCommands(deps);
    const registration = vscodeMock.commands.registerCommand.mock.calls.find(
      ([name]) => name === command,
    );
    expect(registration).toBeDefined();
    const handler = registration![1];
    const uri = vscodeMock.Uri.file("c:\\Users\\Test\\repo\\src\\App.ts");

    await handler({ resourceUri: uri });
    expect(deps[operation].run).toHaveBeenCalledWith(deps.repoRoot, ["src/App.ts"]);
    expect(deps.coordinator.requestNow).toHaveBeenCalledTimes(1);

    await handler(uri);
    expect(deps[operation].run).toHaveBeenCalledTimes(2);
    expect(deps.coordinator.requestNow).toHaveBeenCalledTimes(2);

    await handler(vscodeMock.Uri.file("c:\\Users\\Test\\repo-other\\App.ts"));
    expect(deps[operation].run).toHaveBeenCalledTimes(2);
    expect(deps.coordinator.requestNow).toHaveBeenCalledTimes(2);
    expect(vscodeMock.window.showErrorMessage).not.toHaveBeenCalled();
  });
});
