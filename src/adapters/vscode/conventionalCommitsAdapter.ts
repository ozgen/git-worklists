import * as vscode from "vscode";

const EXT_ID = "vivaxy.vscode-conventional-commits";
const CMD_ID = "extension.conventionalCommits";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getGitApi(): any | null {
  const gitExt = vscode.extensions.getExtension("vscode.git");
  if (!gitExt) {
    return null;
  }
  const exports = gitExt.exports;
  if (!exports?.getAPI) {
    return null;
  }
  return exports.getAPI(1);
}

function findRepoByRoot(gitApi: any, repoRootFsPath: string): any | null {
  const repos: any[] = gitApi?.repositories ?? [];
  const repo = repos.find((r) => r?.rootUri?.fsPath === repoRootFsPath);
  return repo ?? null;
}

async function withTempSetting<T>(
  section: string,
  key: string,
  value: any,
  fn: () => Promise<T>,
): Promise<T> {
  const cfg = vscode.workspace.getConfiguration(section);
  const prev = cfg.get(key);

  // set globally
  await cfg.update(key, value, vscode.ConfigurationTarget.Global);

  try {
    return await fn();
  } finally {
    await cfg.update(key, prev, vscode.ConfigurationTarget.Global);
  }
}

export type ConventionalCommitsAdapter = {
  isInstalled(): boolean;
  runAndReadMessage(
    repoRootFsPath: string,
    opts?: { timeoutMs?: number },
  ): Promise<string | null>;
};

export const conventionalCommitsAdapter: ConventionalCommitsAdapter = {
  isInstalled(): boolean {
    return !!vscode.extensions.getExtension(EXT_ID);
  },

  async runAndReadMessage(
    repoRootFsPath: string,
    opts?: { timeoutMs?: number },
  ): Promise<string | null> {
    const ext = vscode.extensions.getExtension(EXT_ID);
    if (!ext) {
      return null;
    }
    await ext.activate();

    const gitApi = getGitApi();
    if (!gitApi) {
      return null;
    }

    const repo = findRepoByRoot(gitApi, repoRootFsPath);
    if (!repo?.inputBox) {
      return null;
    }

    const before = String(repo.inputBox.value ?? "");

    const timeoutMs = opts?.timeoutMs ?? 15000;

    // Prevent SCM focus switch and prevent auto commit
    return await withTempSetting(
      "conventionalCommits",
      "silentAutoCommit",
      true,
      async () =>
        withTempSetting(
          "conventionalCommits",
          "autoCommit",
          false,
          async () => {
            // Pass repo root URI so it doesn't prompt for repo
            await vscode.commands.executeCommand(
              CMD_ID,
              vscode.Uri.file(repoRootFsPath),
            );

            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
              const now = String(repo.inputBox.value ?? "");
              if (now.trim() && now !== before) {
                return now;
              }
              await sleep(150);
            }

            const after = String(repo.inputBox.value ?? "");
            if (after.trim() && after !== before) {
              return after;
            }

            return null;
          },
        ),
    );
  },
};
