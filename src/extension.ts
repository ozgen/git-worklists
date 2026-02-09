import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { GitCliClient } from "./adapters/git/GitCliClient";
import { WorkspaceStateStore } from "./adapters/storage/WorkspaceStateStore";
import { InitializeWorkspace } from "./usecases/InitializeWorkspace";
import { ChangelistTreeProvider } from "./views/ChangelistTreeProvider";
import { WorklistDecorationProvider } from "./views/WorklistDecorationProvider";
import { RefreshCoordinator } from "./core/refresh/RefreshCoordinator";
import { AutoRefreshController } from "./core/refresh/AutoRefreshController";
import { CommitViewProvider } from "./views/CommitViewProvider";

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
      if (code === 0) {return resolve();}
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
      if (code === 0) {return resolve(stdout);}
      reject(
        new Error(
          `git ${args.join(" ")} failed (code ${code}):\n${stderr || stdout}`,
        ),
      );
    });
  });
}

type StatusV2 = { staged: Set<string> };

// Robust staged detection (porcelain v2 + -z)
async function getStatusV2(repoRoot: string): Promise<StatusV2> {
  const out = await runGitCapture(repoRoot, ["status", "--porcelain=v2", "-z"]);
  const staged = new Set<string>();
  const parts = out.split("\0").filter(Boolean);

  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];

    if (rec.startsWith("1 ") || rec.startsWith("2 ")) {
      const x = rec[2]; // index status: '.' means nothing staged for this entry
      const lastSpace = rec.lastIndexOf(" ");
      const path = lastSpace >= 0 ? rec.slice(lastSpace + 1) : "";
      if (path && x !== "."){ staged.add(path);}

      // rename records have an extra NUL token (orig path); skip it
      if (rec.startsWith("2 ")){ i++;}
    }
  }

  return { staged };
}

function toRepoRelPath(repoRoot: string, uri: vscode.Uri): string {
  const root = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
  const full = uri.fsPath.replace(/\\/g, "/");
  if (full === root) {return "";}
  if (!full.startsWith(root + "/")) {return "";}
  return full.slice(root.length + 1);
}

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {return;}

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
  // Tree view
  // ----------------------------
  const treeProvider = new ChangelistTreeProvider(store);
  treeProvider.setRepoRoot(repoRoot);

  const treeView = vscode.window.createTreeView("gitWorklists.changelists", {
    treeDataProvider: treeProvider,
  });
  context.subscriptions.push(treeView);

  // Decorations
  const deco = new WorklistDecorationProvider(store);
  deco.setRepoRoot(repoRoot);
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(deco),
  );

  // Commit Webview View
  const commitView = new CommitViewProvider(
    context.extensionUri,
    async ({ message, amend, push }) => {
      const msg = message.trim();
      if (!msg){ throw new Error("Commit message is empty.");}

      const s = await getStatusV2(repoRoot);
      if (s.staged.size === 0) {
        throw new Error("No staged files. Stage files first.");
      }

      const commitArgs = ["commit", "-m", msg];
      if (amend){ commitArgs.push("--amend");}

      await runGit(repoRoot, commitArgs);

      if (!push){ return;}

      try {
        if (amend) {
          await runGit(repoRoot, ["push", "--force-with-lease"]);
        } else {
          await runGit(repoRoot, ["push"]);
        }
      } catch (e: any) {
        const text = String(e?.message ?? e);

        // Friendlier message for the common non-fast-forward case
        if (text.includes("non-fast-forward") || text.includes("fetch first")) {
          if (amend) {
            throw new Error(
              "Push rejected because the remote branch moved.\n" +
                "Try again (force-with-lease will work only if nobody pushed new commits after your last fetch).\n" +
                "If this keeps happening: run 'git pull --rebase' and retry.",
            );
          }

          throw new Error(
            "Push rejected (non-fast-forward). Your branch is behind the remote.\n" +
              "Run 'git pull --rebase' and then push again.",
          );
        }

        throw e;
      }
    },
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CommitViewProvider.viewId,
      commitView,
    ),
  );

  // Initialize / refresh pipeline
  const init = new InitializeWorkspace(git, store);

  const doRefresh = async () => {
    await init.run(workspaceFolder.uri.fsPath);
    treeProvider.refresh();
    deco.refreshAll();

    const s = await getStatusV2(repoRoot);
    treeProvider.setStagedPaths(s.staged);
    treeProvider.refresh();
    commitView.updateState({
      stagedCount: s.staged.size,
      lastError: undefined,
    });
  };

  const coordinator = new RefreshCoordinator(doRefresh, 200);
  context.subscriptions.push(coordinator);

  await coordinator.requestNow();

  const auto = new AutoRefreshController(repoRoot, gitDir, () =>
    coordinator.trigger(),
  );
  auto.start();
  context.subscriptions.push(auto);

  // ----------------------------
  // Staging helpers
  // ----------------------------
  async function stagePaths(paths: string[]) {
    const normalized = paths.map(normalizeRepoRelPath).filter(Boolean);
    if (normalized.length === 0){ return;}
    await runGit(repoRoot, ["add", "--", ...normalized]);
  }

  async function unstagePaths(paths: string[]) {
    const normalized = paths.map(normalizeRepoRelPath).filter(Boolean);
    if (normalized.length === 0){ return;}
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
  // Commands (still useful for context menus)
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
          if (!uri){ return;
}
          const rel = toRepoRelPath(repoRoot, uri);
          if (!rel){ return;}

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
          if (!uri){ return;}

          const rel = toRepoRelPath(repoRoot, uri);
          if (!rel) {return;}

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
          if (files.length === 0){ return;}

          const normalized = files.map(normalizeRepoRelPath);

          const s = await getStatusV2(repoRoot);
          const allStaged = normalized.every((p) => s.staged.has(p));

          if (!allStaged){ await stagePaths(normalized);}
          else{ await unstagePaths(normalized);}

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
        vscode.window.showErrorMessage(
          "Git Worklists: refresh failed (see console)",
        );
        console.error(e);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.stagePath",
      async (uri: vscode.Uri) => {
        const rel = toRepoRelPath(repoRoot, uri);
        if (!rel) {return;}
        await runGit(repoRoot, ["add", "--", normalizeRepoRelPath(rel)]);
        await coordinator.requestNow();
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.unstagePath",
      async (uri: vscode.Uri) => {
        const rel = toRepoRelPath(repoRoot, uri);
        if (!rel) {return;}
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
