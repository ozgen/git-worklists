import * as vscode from "vscode";
import { spawn } from "node:child_process";

import { GitCliClient } from "./adapters/git/gitCliClient";
import { WorkspaceStateStore } from "./adapters/storage/workspaceStateStore";

import { LoadOrInitState } from "./usecases/loadOrInitState";
import { ReconcileWithGitStatus } from "./usecases/reconcileWithGitStatus";

import { ChangelistTreeProvider } from "./views/changelistTreeProvider";
import { WorklistDecorationProvider } from "./views/worklistDecorationProvider";
import { CommitViewProvider } from "./views/commitViewProvider";

import { RefreshCoordinator } from "./core/refresh/refreshCoordinator";
import { AutoRefreshController } from "./core/refresh/autoRefreshController";

function normalizeRepoRelPath(p: string): string {
  return p.replace(/\\/g, "/");
}

async function runGit(repoRoot: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        return resolve();
      }

      const msg = (stderr + "\n" + stdout).trim();
      reject(
        new Error(
          `git ${args.join(" ")} failed (code ${code}):\n${msg || "(no output)"}`,
        ),
      );
    });
  });
}

async function runGitCapture(
  repoRoot: string,
  args: string[],
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        return resolve(stdout);
      }

      reject(
        new Error(
          `git ${args.join(" ")} failed (code ${code}):\n${stderr || stdout}`,
        ),
      );
    });
  });
}

/** Source of truth for "staged" (no porcelain parsing). */
async function getStagedPaths(repoRoot: string): Promise<Set<string>> {
  const out = await runGitCapture(repoRoot, [
    "diff",
    "--cached",
    "--name-only",
    "-z",
  ]);
  return new Set(out.split("\0").filter(Boolean));
}

async function headHasParent(repoRoot: string): Promise<boolean> {
  try {
    await runGit(repoRoot, ["rev-parse", "--verify", "HEAD^"]);
    return true;
  } catch {
    return false;
  }
}

async function isHeadEmptyVsParent(repoRoot: string): Promise<boolean> {
  if (!(await headHasParent(repoRoot))) {
    return false;
  } // first commit case
  try {
    // exit 0 => no diff => empty
    await runGit(repoRoot, ["diff", "--quiet", "HEAD^", "HEAD"]);
    return true;
  } catch (e: any) {
    // exit 1 => diff exists => not empty
    const msg = String(e?.message ?? e);
    if (msg.includes("(code 1)")) {
      return false;
    }
    return false;
  }
}

async function getHeadMessage(repoRoot: string): Promise<string> {
  const msg = await runGitCapture(repoRoot, ["log", "-1", "--pretty=%B"]);
  return msg.trim();
}

function toRepoRelPath(repoRoot: string, uri: vscode.Uri): string {
  const root = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const full = uri.fsPath.replace(/\\/g, "/");
  if (full === root) {
    return "";
  }
  if (!full.startsWith(root + "/")) {
    return "";
  }
  return full.slice(root.length + 1);
}

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  const git = new GitCliClient();
  const store = new WorkspaceStateStore(context.workspaceState);

  let repoRoot: string;
  try {
    repoRoot = await git.getRepoRoot(workspaceFolder.uri.fsPath);
  } catch (e) {
    console.error("Git Worklists: not a git repo?", e);
    return;
  }

  const gitDir = await git.getGitDir(repoRoot);

  // ----------------------------
  // Providers
  // ----------------------------
  const treeProvider = new ChangelistTreeProvider(store);
  treeProvider.setRepoRoot(repoRoot);

  const treeView = vscode.window.createTreeView("gitWorklists.changelists", {
    treeDataProvider: treeProvider,
  });
  context.subscriptions.push(treeView);

  const deco = new WorklistDecorationProvider(store);
  deco.setRepoRoot(repoRoot);
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(deco),
  );

  // ----------------------------
  // Use cases
  // ----------------------------
  const loadOrInit = new LoadOrInitState(git, store);
  const reconcile = new ReconcileWithGitStatus(git, store);

  // IMPORTANT: initialize once (idempotent)
  await loadOrInit.run(workspaceFolder.uri.fsPath);

  // ----------------------------
  // Commit Webview View
  // ----------------------------
  const commitView = new CommitViewProvider(
    context.extensionUri,
    async ({ message, amend, push }) => {
      const newMsg = message.trim();
      if (!newMsg) {
        throw new Error("Commit message is empty.");
      }

      const staged = await getStagedPaths(repoRoot);

      if (amend) {
        if (staged.size === 0) {
          const headEmpty = await isHeadEmptyVsParent(repoRoot);
          const oldMsg = await getHeadMessage(repoRoot);

          // allow empty amend ONLY if message changes
          if (newMsg !== oldMsg) {
            await runGit(repoRoot, [
              "commit",
              "--amend",
              "--allow-empty",
              "-m",
              newMsg,
            ]);
          } else {
            throw new Error(
              headEmpty
                ? "Nothing to amend: last commit is empty and message is unchanged."
                : "Nothing staged to amend. Stage files or disable Amend.",
            );
          }
        } else {
          await runGit(repoRoot, ["commit", "--amend", "-m", newMsg]);
        }
      } else {
        if (staged.size === 0) {
          throw new Error("No staged files. Stage files first.");
        }
        await runGit(repoRoot, ["commit", "-m", newMsg]);
      }

      if (!push) {
        return;
      }

      if (amend) {
        await runGit(repoRoot, ["push", "--force-with-lease"]);
      } else {
        await runGit(repoRoot, ["push"]);
      }
    },
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CommitViewProvider.viewId,
      commitView,
    ),
  );

  // ----------------------------
  // Refresh pipeline
  // ----------------------------
  const doRefresh = async () => {
    await reconcile.run(repoRoot);

    const staged = await getStagedPaths(repoRoot);
    treeProvider.setStagedPaths(staged);

    treeProvider.refresh();
    deco.refreshAll();

    commitView.updateState({
      stagedCount: staged.size,
      lastError: undefined,
    });
  };

  const coordinator = new RefreshCoordinator(doRefresh, 200);
  context.subscriptions.push(coordinator);

  // First refresh
  await coordinator.requestNow();

  // Auto refresh signals
  const auto = new AutoRefreshController(repoRoot, gitDir, () =>
    coordinator.trigger(),
  );
  auto.start();
  context.subscriptions.push(auto);

  // ----------------------------
  // Staging helpers (checkboxes + commands)
  // ----------------------------
  async function stagePaths(paths: string[]) {
    const normalized = paths.map(normalizeRepoRelPath).filter(Boolean);
    if (normalized.length === 0) {
      return;
    }
    await runGit(repoRoot, ["add", "--", ...normalized]);
  }

  async function unstagePaths(paths: string[]) {
    const normalized = paths.map(normalizeRepoRelPath).filter(Boolean);
    if (normalized.length === 0) {
      return;
    }
    await runGit(repoRoot, ["restore", "--staged", "--", ...normalized]);
  }

  treeView.onDidChangeCheckboxState(async (e) => {
    try {
      for (const item of e.items as any[]) {
        const kind = item?.kind;

        // File node: has repoRelativePath
        if (kind === "file" && typeof item?.repoRelativePath === "string") {
          const p = normalizeRepoRelPath(item.repoRelativePath);
          if (item.checkboxState === vscode.TreeItemCheckboxState.Checked) {
            await stagePaths([p]);
          } else {
            await unstagePaths([p]);
          }
          continue;
        }

        // Group node: has list.files
        if (kind === "group" && Array.isArray(item?.list?.files)) {
          const files: string[] = item.list.files;
          if (item.checkboxState === vscode.TreeItemCheckboxState.Checked) {
            await stagePaths(files);
          } else {
            await unstagePaths(files);
          }
        }
      }

      await coordinator.requestNow();
    } catch (err) {
      console.error(err);
      vscode.window.showErrorMessage(
        "Git Worklists: staging via checkbox failed (see console)",
      );
    }
  });

  // ----------------------------
  // Commands (context menus)
  // ----------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.selectFile",
      async (arg: any) => {
        try {
          const uri: vscode.Uri | undefined =
            arg?.resourceUri instanceof vscode.Uri
              ? arg.resourceUri
              : arg instanceof vscode.Uri
                ? arg
                : undefined;
          if (!uri) {
            return;
          }

          const rel = toRepoRelPath(repoRoot, uri);
          if (!rel) {
            return;
          }

          await stagePaths([rel]);
          await coordinator.requestNow();
        } catch (e) {
          console.error(e);
          vscode.window.showErrorMessage(
            "Git Worklists: failed to stage file (see console)",
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.unselectFile",
      async (arg: any) => {
        try {
          const uri: vscode.Uri | undefined =
            arg?.resourceUri instanceof vscode.Uri
              ? arg.resourceUri
              : arg instanceof vscode.Uri
                ? arg
                : undefined;
          if (!uri) {
            return;
          }

          const rel = toRepoRelPath(repoRoot, uri);
          if (!rel) {
            return;
          }

          await unstagePaths([rel]);
          await coordinator.requestNow();
        } catch (e) {
          console.error(e);
          vscode.window.showErrorMessage(
            "Git Worklists: failed to unstage file (see console)",
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.toggleGroupSelection",
      async (groupNode: any) => {
        try {
          const files: string[] = Array.isArray(groupNode?.list?.files)
            ? groupNode.list.files
            : [];
          if (files.length === 0) {
            return;
          }

          const normalized = files.map(normalizeRepoRelPath);
          const staged = await getStagedPaths(repoRoot);
          const allStaged = normalized.every((p) => staged.has(p));

          if (!allStaged) {
            await stagePaths(normalized);
          } else {
            await unstagePaths(normalized);
          }

          await coordinator.requestNow();
        } catch (e) {
          console.error(e);
          vscode.window.showErrorMessage(
            "Git Worklists: failed to toggle group staging (see console)",
          );
        }
      },
    ),

    vscode.commands.registerCommand("gitWorklists.refresh", async () => {
      try {
        await coordinator.requestNow();
      } catch (e) {
        console.error(e);
        vscode.window.showErrorMessage(
          "Git Worklists: refresh failed (see console)",
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.stagePath",
      async (uri: vscode.Uri) => {
        const rel = toRepoRelPath(repoRoot, uri);
        if (!rel) {
          return;
        }
        await runGit(repoRoot, ["add", "--", normalizeRepoRelPath(rel)]);
        await coordinator.requestNow();
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.unstagePath",
      async (uri: vscode.Uri) => {
        const rel = toRepoRelPath(repoRoot, uri);
        if (!rel) {
          return;
        }
        await runGit(repoRoot, [
          "restore",
          "--staged",
          "--",
          normalizeRepoRelPath(rel),
        ]);
        await coordinator.requestNow();
      },
    ),
  );
}

export function deactivate() {}
