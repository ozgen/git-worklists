import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeMock = vi.hoisted(() => {
  class Uri {
    constructor(public readonly fsPath: string) {}
    static file(p: string) {
      return new Uri(p);
    }
  }

  const conventionalExt = {
    activate: vi.fn(async () => undefined),
    exports: undefined,
  };

  const gitExt = {
    exports: {
      getAPI: vi.fn(() => ({
        repositories: [],
      })),
    },
  };

  const defaultGetExtensionImpl = (id: string) => {
    if (id === "vivaxy.vscode-conventional-commits") {
      return conventionalExt;
    }
    if (id === "vscode.git") {
      return gitExt;
    }
    return undefined;
  };

  const extensions = {
    getExtension: vi.fn(defaultGetExtensionImpl),
    __defaultGetExtensionImpl: defaultGetExtensionImpl,
  };

  const commands = {
    executeCommand: vi.fn(async (_cmd: string, _arg?: any) => undefined),
  };

  const configStore = new Map<string, Map<string, any>>();
  const configObjects = new Map<
    string,
    {
      get: (key: string) => any;
      update: (key: string, value: any, target?: any) => Promise<void>;
    }
  >();

  const workspace = {
    getConfiguration: vi.fn((section: string) => {
      if (!configStore.has(section)) {
        configStore.set(section, new Map());
      }
      const bucket = configStore.get(section)!;

      if (!configObjects.has(section)) {
        configObjects.set(section, {
          get: (key: string) => bucket.get(key),
          update: async (key: string, value: any) => {
            bucket.set(key, value);
          },
        });
      }

      return configObjects.get(section)!;
    }),
  };

  const ConfigurationTarget = {
    Global: 1,
    Workspace: 2,
  };

  return {
    Uri,
    extensions,
    commands,
    workspace,
    ConfigurationTarget,
    __conventionalExt: conventionalExt,
    __gitExt: gitExt,
    __configStore: configStore,
  };
});

vi.mock("vscode", () => vscodeMock);

import * as vscode from "vscode";
import { conventionalCommitsAdapter } from "../../../../adapters/vscode/conventionalCommitsAdapter";

function setGitRepos(repos: any[]) {
  (vscode as any).__gitExt.exports.getAPI.mockReturnValue({
    repositories: repos,
  });
}

describe("conventionalCommitsAdapter (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    (vscode as any).__configStore.clear();

    const def = (vscode as any).extensions.__defaultGetExtensionImpl;
    (vscode as any).extensions.getExtension.mockImplementation(def);
  });

  it("isInstalled: returns true when extension exists", () => {
    expect(conventionalCommitsAdapter.isInstalled()).toBe(true);
  });

  it("runAndReadMessage: returns null if conventional commits extension is missing", async () => {
    (vscode as any).extensions.getExtension.mockImplementation((id: string) => {
      if (id === "vivaxy.vscode-conventional-commits") {
        return undefined;
      }
      if (id === "vscode.git") {
        return (vscode as any).__gitExt;
      }
      return undefined;
    });

    const res = await conventionalCommitsAdapter.runAndReadMessage("/repo");
    expect(res).toBeNull();
  });

  it("runAndReadMessage: returns null if git extension API is missing", async () => {
    (vscode as any).extensions.getExtension.mockImplementation((id: string) => {
      if (id === "vivaxy.vscode-conventional-commits") {
        return (vscode as any).__conventionalExt;
      }
      if (id === "vscode.git") {
        return undefined;
      }
      return undefined;
    });

    const res = await conventionalCommitsAdapter.runAndReadMessage("/repo");
    expect(res).toBeNull();
  });

  it("runAndReadMessage: returns null if repo not found", async () => {
    setGitRepos([{ rootUri: { fsPath: "/other" }, inputBox: { value: "" } }]);

    const res = await conventionalCommitsAdapter.runAndReadMessage("/repo");
    expect(res).toBeNull();
  });

  it("runAndReadMessage: returns null if repo has no inputBox", async () => {
    setGitRepos([{ rootUri: { fsPath: "/repo" } }]);

    const res = await conventionalCommitsAdapter.runAndReadMessage("/repo");
    expect(res).toBeNull();
  });

  it("runAndReadMessage: executes command with repoRoot Uri and returns message when it changes", async () => {
    const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
    setGitRepos([repo]);

    (vscode as any).commands.executeCommand.mockImplementation(
      async (_cmd: string, _arg: any) => {
        repo.inputBox.value = "docs: hello";
      },
    );

    const res = await conventionalCommitsAdapter.runAndReadMessage("/repo", {
      timeoutMs: 15000,
    });

    expect(res).toBe("docs: hello");

    expect((vscode as any).commands.executeCommand).toHaveBeenCalledWith(
      "extension.conventionalCommits",
      vscode.Uri.file("/repo"),
    );

    expect((vscode as any).__conventionalExt.activate).toHaveBeenCalledTimes(1);
  });

  it("runAndReadMessage: sets temporary settings and restores them (silentAutoCommit + autoCommit)", async () => {
    const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
    setGitRepos([repo]);

    const cfg = (vscode as any).workspace.getConfiguration(
      "conventionalCommits",
    );

    // Seed previous values
    await cfg.update(
      "silentAutoCommit",
      false,
      (vscode as any).ConfigurationTarget.Global,
    );
    await cfg.update(
      "autoCommit",
      true,
      (vscode as any).ConfigurationTarget.Global,
    );

    (vscode as any).commands.executeCommand.mockImplementation(async () => {
      repo.inputBox.value = "feat: ok";
    });

    const res = await conventionalCommitsAdapter.runAndReadMessage("/repo", {
      timeoutMs: 15000,
    });

    expect(res).toBe("feat: ok");

    const cfgAfter = (vscode as any).workspace.getConfiguration(
      "conventionalCommits",
    );
    expect(cfgAfter.get("silentAutoCommit")).toBe(false);
    expect(cfgAfter.get("autoCommit")).toBe(true);
  });

  it("runAndReadMessage: returns null on timeout if message never changes", async () => {
    vi.useFakeTimers();

    const repo = { rootUri: { fsPath: "/repo" }, inputBox: { value: "" } };
    setGitRepos([repo]);

    (vscode as any).commands.executeCommand.mockImplementation(async () => {});

    const p = conventionalCommitsAdapter.runAndReadMessage("/repo", {
      timeoutMs: 500,
    });

    await vi.advanceTimersByTimeAsync(2000);
    const res = await p;

    expect(res).toBeNull();

    vi.useRealTimers();
  });
});
