import { describe, it, expect, vi, beforeEach } from "vitest";

type FakeUri = { fsPath: string };
function uri(p: string): FakeUri {
  return { fsPath: p };
}

const mocks = vi.hoisted(() => {
  return {
    runGit: vi.fn(),
    toRepoRelPath: vi.fn(),
    normalizeRepoRelPath: vi.fn(),
  };
});

vi.mock("../../../utils/process", () => {
  return { runGit: mocks.runGit };
});

vi.mock("../../../utils/paths", () => {
  return {
    toRepoRelPath: mocks.toRepoRelPath,
    normalizeRepoRelPath: mocks.normalizeRepoRelPath,
  };
});

import { SystemChangelist } from "../../../core/changelist/systemChangelist";
import { HandleNewFilesCreated } from "../../../usecases/handleNewFilesCreated";

beforeEach(() => {
  mocks.runGit.mockReset();
  mocks.toRepoRelPath.mockReset();
  mocks.normalizeRepoRelPath.mockReset();
});

function makeDeps(
  overrides?: Partial<ConstructorParameters<typeof HandleNewFilesCreated>[0]>,
) {
  const moveFiles = {
    run: vi.fn().mockResolvedValue(undefined),
  };

  const coordinator = {
    requestNow: vi.fn().mockResolvedValue(undefined),
  };

  const settings = {
    getPromptOnNewFile: vi.fn().mockReturnValue(true),
    setPromptOnNewFile: vi.fn().mockResolvedValue(undefined),
  };

  const prompt = {
    confirmAddNewFiles: vi.fn().mockResolvedValue("dismiss"),
  };

  const base = {
    repoRoot: "/repo",
    moveFiles,
    coordinator,
    settings,
    prompt,
  };

  return { ...base, ...(overrides ?? {}) };
}

describe("HandleNewFilesCreated", () => {
  it("does nothing when prompt is disabled", async () => {
    const deps = makeDeps({
      settings: {
        getPromptOnNewFile: vi.fn().mockReturnValue(false),
        setPromptOnNewFile: vi.fn().mockResolvedValue(undefined),
      },
    });

    const uc = new HandleNewFilesCreated(deps);
    await uc.run([uri("/repo/a.txt")] as unknown as any);

    expect(deps.settings.getPromptOnNewFile).toHaveBeenCalledTimes(1);
    expect(mocks.toRepoRelPath).not.toHaveBeenCalled();
    expect(deps.prompt.confirmAddNewFiles).not.toHaveBeenCalled();
    expect(deps.moveFiles.run).not.toHaveBeenCalled();
    expect(deps.coordinator.requestNow).not.toHaveBeenCalled();
    expect(mocks.runGit).not.toHaveBeenCalled();
  });

  it("does nothing for empty uri list", async () => {
    const deps = makeDeps();
    const uc = new HandleNewFilesCreated(deps);

    await uc.run([] as unknown as any);

    expect(deps.prompt.confirmAddNewFiles).not.toHaveBeenCalled();
    expect(deps.moveFiles.run).not.toHaveBeenCalled();
    expect(deps.coordinator.requestNow).not.toHaveBeenCalled();
    expect(mocks.runGit).not.toHaveBeenCalled();
  });

  it("filters out non-repo paths and .git paths", async () => {
    const deps = makeDeps();

    mocks.toRepoRelPath.mockImplementation((_repoRoot: string, u: FakeUri) => {
      if (u.fsPath.endsWith("outside.txt")) {
        return null;
      }
      if (u.fsPath.endsWith("hooks/post-commit")) {
        return ".git/hooks/post-commit";
      }
      return "ok.txt";
    });

    mocks.normalizeRepoRelPath.mockImplementation((p: string) => p);

    const uc = new HandleNewFilesCreated(deps);
    await uc.run([
      uri("/x/outside.txt"),
      uri("/repo/.git/hooks/post-commit"),
    ] as unknown as any);

    expect(deps.prompt.confirmAddNewFiles).not.toHaveBeenCalled();
    expect(deps.moveFiles.run).not.toHaveBeenCalled();
    expect(deps.coordinator.requestNow).not.toHaveBeenCalled();
    expect(mocks.runGit).not.toHaveBeenCalled();
  });

  it("skips ignored files (check-ignore exit 0) and keeps non-ignored", async () => {
    const deps = makeDeps({
      prompt: {
        confirmAddNewFiles: vi.fn().mockResolvedValue("keep"),
      },
    });

    mocks.toRepoRelPath.mockImplementation((_repoRoot: string, u: FakeUri) =>
      u.fsPath.endsWith("a.txt") ? "a.txt" : "b.txt",
    );
    mocks.normalizeRepoRelPath.mockImplementation((p: string) => p);

    mocks.runGit.mockImplementation(async (_cwd: string, args: string[]) => {
      if (args[0] === "check-ignore" && args[args.length - 1] === "a.txt") {
        return;
      }
      if (args[0] === "check-ignore" && args[args.length - 1] === "b.txt") {
        throw new Error("exit 1");
      }
      throw new Error("unexpected runGit");
    });

    const uc = new HandleNewFilesCreated(deps);
    await uc.run([uri("/repo/a.txt"), uri("/repo/b.txt")] as unknown as any);

    expect(deps.prompt.confirmAddNewFiles).toHaveBeenCalledWith(1, "b.txt");

    expect(deps.moveFiles.run).toHaveBeenCalledWith(
      "/repo",
      ["b.txt"],
      SystemChangelist.Unversioned,
    );
    expect(deps.coordinator.requestNow).toHaveBeenCalledTimes(1);
  });

  it("decision=disable updates setting, moves to Unversioned, refreshes", async () => {
    const deps = makeDeps({
      prompt: { confirmAddNewFiles: vi.fn().mockResolvedValue("disable") },
    });

    mocks.toRepoRelPath.mockReturnValue("new.txt");
    mocks.normalizeRepoRelPath.mockReturnValue("new.txt");

    mocks.runGit.mockImplementation(async (_cwd: string, args: string[]) => {
      if (args[0] === "check-ignore") {
        throw new Error("exit 1");
      }
      throw new Error("unexpected runGit");
    });

    const uc = new HandleNewFilesCreated(deps);
    await uc.run([uri("/repo/new.txt")] as unknown as any);

    expect(deps.settings.setPromptOnNewFile).toHaveBeenCalledWith(false);
    expect(deps.moveFiles.run).toHaveBeenCalledWith(
      "/repo",
      ["new.txt"],
      SystemChangelist.Unversioned,
    );
    expect(deps.coordinator.requestNow).toHaveBeenCalledTimes(1);
  });

  it("decision=add stages, moves to Default, refreshes", async () => {
    const deps = makeDeps({
      prompt: { confirmAddNewFiles: vi.fn().mockResolvedValue("add") },
    });

    mocks.toRepoRelPath.mockReturnValue("new.txt");
    mocks.normalizeRepoRelPath.mockReturnValue("new.txt");

    mocks.runGit.mockImplementation(async (_cwd: string, args: string[]) => {
      if (args[0] === "check-ignore") {
        throw new Error("exit 1");
      }
      if (args[0] === "add") {
        return;
      }
      throw new Error("unexpected runGit");
    });

    const uc = new HandleNewFilesCreated(deps);
    await uc.run([uri("/repo/new.txt")] as unknown as any);

    expect(mocks.runGit).toHaveBeenCalledWith("/repo", [
      "add",
      "--",
      "new.txt",
    ]);

    expect(deps.moveFiles.run).toHaveBeenCalledWith(
      "/repo",
      ["new.txt"],
      SystemChangelist.Default,
    );

    expect(deps.coordinator.requestNow).toHaveBeenCalledTimes(1);
  });

  it("decision=dismiss moves to Unversioned and refreshes", async () => {
    const deps = makeDeps({
      prompt: { confirmAddNewFiles: vi.fn().mockResolvedValue("dismiss") },
    });

    mocks.toRepoRelPath.mockReturnValue("x.txt");
    mocks.normalizeRepoRelPath.mockReturnValue("x.txt");

    mocks.runGit.mockImplementation(async (_cwd: string, args: string[]) => {
      if (args[0] === "check-ignore") {
        throw new Error("exit 1");
      }
      throw new Error("unexpected runGit");
    });

    const uc = new HandleNewFilesCreated(deps);
    await uc.run([uri("/repo/x.txt")] as unknown as any);

    expect(deps.moveFiles.run).toHaveBeenCalledWith(
      "/repo",
      ["x.txt"],
      SystemChangelist.Unversioned,
    );
    expect(deps.coordinator.requestNow).toHaveBeenCalledTimes(1);
  });

  it("passes undefined sample when multiple candidates", async () => {
    const deps = makeDeps({
      prompt: { confirmAddNewFiles: vi.fn().mockResolvedValue("keep") },
    });

    mocks.toRepoRelPath.mockImplementation((_repoRoot: string, u: FakeUri) =>
      u.fsPath.endsWith("a.txt") ? "a.txt" : "b.txt",
    );
    mocks.normalizeRepoRelPath.mockImplementation((p: string) => p);

    mocks.runGit.mockImplementation(async (_cwd: string, args: string[]) => {
      if (args[0] === "check-ignore") {
        throw new Error("exit 1");
      }
      throw new Error("unexpected runGit");
    });

    const uc = new HandleNewFilesCreated(deps);
    await uc.run([uri("/repo/a.txt"), uri("/repo/b.txt")] as unknown as any);

    expect(deps.prompt.confirmAddNewFiles).toHaveBeenCalledWith(2, undefined);
  });
});
