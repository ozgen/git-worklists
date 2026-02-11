import * as vscode from "vscode";
import { spawn } from "node:child_process";

import { GitCliClient } from "./adapters/git/gitCliClient";
import { WorkspaceStateStore } from "./adapters/storage/workspaceStateStore";
import { GhCliPrProvider } from "./adapters/pr/github/ghCliPrProvider";

import { LoadOrInitState } from "./usecases/loadOrInitState";
import { ReconcileWithGitStatus } from "./usecases/reconcileWithGitStatus";
import { CreateChangelist } from "./usecases/createChangelist";
import { MoveFilesToChangelist } from "./usecases/moveFilesToChangelist";
import { DeleteChangelist } from "./usecases/deleteChangelist";
import { ListOpenPullRequests } from "./usecases/pr/listOpenPullRequests";
import { LoadPullRequestDetails } from "./usecases/pr/loadPullRequestDetails";
import { AddPullRequestComment } from "./usecases/pr/addPullRequestComment";
import { SubmitPullRequestReview } from "./usecases/pr/submitPullRequestReview";
import { AddPullRequestInlineComment } from "./usecases/pr/addPullRequestInlineComment";

import { ChangelistTreeProvider } from "./views/changelistTreeProvider";
import { WorklistDecorationProvider } from "./views/worklistDecorationProvider";
import { CommitViewProvider } from "./views/commitViewProvider";
import { PrTreeProvider } from "./views/pr/prTreeProvider";
import { PrDetailsTreeProvider } from "./views/pr/prDetailsTreeProvider";

import { GitRefContentProvider } from "./views/pr/gitRefContentProvider";

import { RefreshCoordinator } from "./core/refresh/refreshCoordinator";
import { AutoRefreshController } from "./core/refresh/autoRefreshController";
import { PrSelection } from "./core/pr/session/prSelection";

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

function getRepoRelPathForEditor(repoRoot: string, uri: vscode.Uri): string {
  if (uri.scheme === "file") {
    return toRepoRelPath(repoRoot, uri);
  }

  if (uri.scheme === GitRefContentProvider.scheme) {
    // path looks like "/pom.xml" -> "pom.xml"
    return uri.path.replace(/^\/+/, "");
  }

  return "";
}

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  const git = new GitCliClient();
  const store = new WorkspaceStateStore(context.workspaceState);
  const createChangelist = new CreateChangelist(store);
  const moveFiles = new MoveFilesToChangelist(store);
  const deleteChangelist = new DeleteChangelist(git, store);

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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.createChangelist",
      async () => {
        const name = await vscode.window.showInputBox({
          prompt: "Changelist name",
          placeHolder: "e.g. Hotfix, Refactor, WIP",
        });
        if (!name) {
          return;
        }

        try {
          await createChangelist.run(repoRoot, name);
          await coordinator.requestNow(); // refresh tree + decorations
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),
  );

  async function pickTargetList(): Promise<
    { id: string; name: string } | undefined
  > {
    const state = await store.load(repoRoot);
    const lists = state?.version === 1 ? state.lists : [];

    const items = lists.map((l) => ({ label: l.name, id: l.id }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Move to changelist",
    });
    return picked ? { id: picked.id, name: picked.label } : undefined;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.moveFileToChangelist",
      async (node: any) => {
        const p =
          typeof node?.repoRelativePath === "string"
            ? normalizeRepoRelPath(node.repoRelativePath)
            : "";
        if (!p) {
          return;
        }

        const target = await pickTargetList();
        if (!target) {
          return;
        }

        try {
          await moveFiles.run(repoRoot, [p], target.id);
          await coordinator.requestNow();
        } catch (e: any) {
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.moveGroupToChangelist",
      async (node: any) => {
        const files: string[] = Array.isArray(node?.list?.files)
          ? node.list.files
          : [];
        if (files.length === 0) {
          return;
        }

        const target = await pickTargetList();
        if (!target) {
          return;
        }

        try {
          await moveFiles.run(
            repoRoot,
            files.map(normalizeRepoRelPath),
            target.id,
          );
          await coordinator.requestNow();
        } catch (e: any) {
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.deleteChangelist",
      async (node: any) => {
        const listId = typeof node?.list?.id === "string" ? node.list.id : "";
        const listName =
          typeof node?.list?.name === "string" ? node.list.name : "";
        if (!listId) {
          return;
        }

        const ok = await vscode.window.showWarningMessage(
          `Delete changelist "${listName}"? Files will be moved to Changes.`,
          { modal: true },
          "Delete",
        );
        if (ok !== "Delete") {
          return;
        }

        try {
          await deleteChangelist.run(repoRoot, listId);
          await coordinator.requestNow();
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),
  );

  // ----------------------------
  // PR (GitHub via gh)
  // ----------------------------
  const prProvider = new GhCliPrProvider();
  const listPRs = new ListOpenPullRequests(prProvider);
  const loadPR = new LoadPullRequestDetails(prProvider);
  const addPrComment = new AddPullRequestComment(prProvider);
  const submitPrReview = new SubmitPullRequestReview(prProvider);
  const addInline = new AddPullRequestInlineComment(prProvider);
  const prSelection = new PrSelection();

  const prTree = new PrTreeProvider();
  const prDetailsTree = new PrDetailsTreeProvider();
  const prTreeView = vscode.window.createTreeView("gitWorklists.pullRequests", {
    treeDataProvider: prTree,
  });

  context.subscriptions.push(
    prTreeView,
    vscode.window.createTreeView("gitWorklists.prDetails", {
      treeDataProvider: prDetailsTree,
    }),
  );

  prTreeView.onDidChangeVisibility(async (e) => {
    if (e.visible) {
      await refreshPRs();
    }
  });

  let selectedPrDetails: any | undefined;

  async function refreshPRs() {
    try {
      prTree.setPullRequests(await listPRs.run(repoRoot));
    } catch (e: any) {
      prTree.setPullRequests([]);
      vscode.window.showErrorMessage(String(e?.message ?? e));
    }
  }

  // GitHub-only: fetch PR head ref locally (no checkout)
  async function fetchPrRef(prNumber: number): Promise<string> {
    const refName = `refs/git-worklists/pr/${prNumber}`;
    await runGit(repoRoot, [
      "fetch",
      "origin",
      `pull/${prNumber}/head:${refName}`,
    ]);
    return refName;
  }

  // Select PR -> load details -> show in PR Details view
  context.subscriptions.push(
    vscode.commands.registerCommand("gitWorklists.pr.refresh", refreshPRs),

    vscode.commands.registerCommand(
      "gitWorklists.pr.select",
      async (prNumber: number) => {
        try {
          prSelection.set(prNumber);
          const details = await loadPR.run(repoRoot, prNumber);
          selectedPrDetails = details;
          prDetailsTree.setDetails(details);
        } catch (e: any) {
          selectedPrDetails = undefined;
          prDetailsTree.setDetails(undefined);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.pr.openFileDiff",
      async (filePath: string) => {
        if (!selectedPrDetails) {
          vscode.window.showErrorMessage("Select a PR first.");
          return;
        }

        const prNumber = Number(selectedPrDetails.number);
        const baseRefName = String(selectedPrDetails.baseRefName ?? "main");
        const baseRef = `origin/${baseRefName}`;

        const prRef = await fetchPrRef(prNumber);

        const left = vscode.Uri.parse(
          `${GitRefContentProvider.scheme}:/${filePath}?ref=${encodeURIComponent(baseRef)}`,
        );
        const right = vscode.Uri.parse(
          `${GitRefContentProvider.scheme}:/${filePath}?ref=${encodeURIComponent(prRef)}`,
        );

        await vscode.commands.executeCommand(
          "vscode.diff",
          left,
          right,
          `PR #${prNumber}: ${filePath}`,
        );
      },
    ),

    vscode.commands.registerCommand("gitWorklists.pr.comment", async () => {
      if (!selectedPrDetails) {
        return vscode.window.showErrorMessage("Select a PR first.");
      }
      const prNumber = Number(selectedPrDetails.number);

      const body = await vscode.window.showInputBox({ prompt: "PR comment" });
      if (!body) {
        return;
      }

      await addPrComment.run(repoRoot, prNumber, body);
      const details = await loadPR.run(repoRoot, prNumber);
      selectedPrDetails = details;
      prDetailsTree.setDetails(details);
    }),

    vscode.commands.registerCommand("gitWorklists.pr.approve", async () => {
      if (!selectedPrDetails) {
        return vscode.window.showErrorMessage("Select a PR first.");
      }
      const prNumber = Number(selectedPrDetails.number);

      const body = await vscode.window.showInputBox({
        prompt: "Approval message (optional)",
      });
      await submitPrReview.run(repoRoot, prNumber, "approve", body);

      void vscode.window.showInformationMessage(`Approved PR #${prNumber}.`);

      const details = await loadPR.run(repoRoot, prNumber);
      selectedPrDetails = details;
      prDetailsTree.setDetails(details);
    }),

    vscode.commands.registerCommand(
      "gitWorklists.pr.requestChanges",
      async () => {
        if (!selectedPrDetails) {
          return vscode.window.showErrorMessage("Select a PR first.");
        }
        const prNumber = Number(selectedPrDetails.number);

        const body = await vscode.window.showInputBox({
          prompt: "Request changes message",
        });
        if (!body) {
          return;
        }

        await submitPrReview.run(repoRoot, prNumber, "requestChanges", body);

        void vscode.window.showInformationMessage(
          `Requested changes on PR #${prNumber}.`,
        );

        const details = await loadPR.run(repoRoot, prNumber);
        selectedPrDetails = details;
        prDetailsTree.setDetails(details);
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.pr.openInBrowser",
      async () => {
        if (!selectedPrDetails) {
          return vscode.window.showErrorMessage("Select a PR first.");
        }
        await vscode.env.openExternal(
          vscode.Uri.parse(String(selectedPrDetails.url)),
        );
      },
    ),
  );

  // register the virtual document provider (needed for vscode.diff)
  const refProvider = new GitRefContentProvider(repoRoot);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      GitRefContentProvider.scheme,
      refProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitWorklists.pr.commentLine", async () => {
      try {
        const prNumber = prSelection.get();
        if (!prNumber) {
          throw new Error(
            "No PR selected. Select a PR first in the Pull Requests view.",
          );
        }

        const ed = vscode.window.activeTextEditor;
        if (!ed) {
          return;
        }

        const relPath = getRepoRelPathForEditor(repoRoot, ed.document.uri);
        if (!relPath) {
          throw new Error("File is not inside the current repo.");
        }

        const line = ed.selection.active.line + 1;

        const body = await vscode.window.showInputBox({
          prompt: `Inline comment for ${relPath}:${line}`,
          placeHolder: "Write a short comment…",
        });
        if (!body) {
          return;
        }

        await addInline.run(repoRoot, prNumber, relPath, line, body);

        const details = await loadPR.run(repoRoot, prNumber);
        selectedPrDetails = details;
        prDetailsTree.setDetails(details);

        vscode.window.showInformationMessage(
          `Inline comment added to PR #${prNumber}: ${relPath}:${line}`,
        );
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        vscode.window.showErrorMessage(
          msg.includes("Validation Failed") ||
            msg.toLowerCase().includes("diff")
            ? "Cannot add inline comment: the selected line is not part of this PR’s diff. Add a normal PR comment instead."
            : msg,
        );
      }
    }),
  );
}

export function deactivate() {}
