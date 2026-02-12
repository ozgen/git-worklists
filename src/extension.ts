import * as vscode from "vscode";

import { runGit, runGitCapture } from "./utils/process";
import { runGhCapture } from "./utils/process";
import {
  normalizeRepoRelPath,
  toRepoRelPath,
  getRepoRelPathForEditor,
} from "./utils/paths";
import { getRepoNameWithOwner } from "./utils/github";
import { computeLineToDiffPosition } from "./utils/diffHunks";

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
import { LoadPullRequestInlineComments } from "./usecases/pr/loadPullRequestInlineComments";

import { ChangelistTreeProvider } from "./views/changelistTreeProvider";
import { WorklistDecorationProvider } from "./views/worklistDecorationProvider";
import { CommitViewProvider } from "./views/commitViewProvider";
import { PrTreeProvider } from "./views/pr/prTreeProvider";
import { PrDetailsTreeProvider } from "./views/pr/prDetailsTreeProvider";
import { PrInlineCommentsController } from "./views/pr/prInlineCommentsController";

import { GitRefContentProvider } from "./views/pr/gitRefContentProvider";

import { RefreshCoordinator } from "./core/refresh/refreshCoordinator";
import { AutoRefreshController } from "./core/refresh/autoRefreshController";
import { PrSelection } from "./core/pr/session/prSelection";
import { AddPullRequestInlineReply } from "./usecases/pr/addPullRequestInlineReply";

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

      const pushConfirmed = await vscode.window.showWarningMessage(
        amend
          ? "Push amended commit (force-with-lease)?"
          : "Push commits to remote?",
        {
          modal: true,
          detail: amend
            ? "This will run: git push --force-with-lease"
            : "This will run: git push",
        },
        "Push",
      );

      if (pushConfirmed !== "Push") {
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
  async function getStagedPaths(repoRoot: string): Promise<Set<string>> {
    const out = await runGitCapture(repoRoot, [
      "diff",
      "--cached",
      "--name-only",
      "-z",
    ]);
    return new Set(out.split("\0").filter(Boolean));
  }

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

    // Only attempt to unstage paths that are actually staged.
    const staged = await getStagedPaths(repoRoot);
    const toUnstage = normalized.filter((p) => staged.has(p));

    // If nothing is staged, treat it as a no-op (no error).
    if (toUnstage.length === 0) {
      return;
    }

    await runGit(repoRoot, ["restore", "--staged", "--", ...toUnstage]);
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
  // Confirmation Action helper
  // ----------------------------

  async function confirmAction(
    title: string,
    detail: string,
  ): Promise<boolean> {
    const ok = await vscode.window.showWarningMessage(
      title,
      { modal: true, detail },
      "Yes",
    );
    return ok === "Yes";
  }

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
  const loadInlineComments = new LoadPullRequestInlineComments(prProvider);
  const replyInline = new AddPullRequestInlineReply(prProvider);
  const prSelection = new PrSelection();

  const prTree = new PrTreeProvider();
  const prDetailsTree = new PrDetailsTreeProvider();

  let hunkLinesByFile:
    | Map<
        string,
        {
          leftLineToPos: Map<number, number>;
          rightLineToPos: Map<number, number>;
        }
      >
    | undefined;

  let currentDiffContext:
    | {
        prNumber: number;
        filePath: string;
        left: vscode.Uri;
        right: vscode.Uri;
        baseRef: string;
        prRef: string;
      }
    | undefined;

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

  const inlineCommentsUi = new PrInlineCommentsController();
  context.subscriptions.push(inlineCommentsUi);

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

        currentDiffContext = {
          prNumber,
          filePath,
          left,
          right,
          baseRef, // e.g. origin/main
          prRef, // e.g. refs/git-worklists/pr/123
        };

        // inside gitWorklists.pr.openFileDiff
        try {
          const nameWithOwner = await getRepoNameWithOwner(repoRoot);

          const raw = await runGhCapture(repoRoot, [
            "api",
            "--paginate",
            "-H",
            "Accept: application/vnd.github+json",
            "-H",
            "X-GitHub-Api-Version: 2022-11-28",
            `repos/${nameWithOwner}/pulls/${prNumber}/files`,
          ]);

          const files = JSON.parse(raw) as any[];
          const map = new Map<
            string,
            {
              leftLineToPos: Map<number, number>;
              rightLineToPos: Map<number, number>;
            }
          >();

          for (const f of Array.isArray(files) ? files : []) {
            const p = normalizeRepoRelPath(String(f?.filename ?? ""));
            const patch = String(f?.patch ?? "");
            if (!p || !patch) {
              continue;
            } // binary/too large => no patch => no inline comments

            map.set(p, computeLineToDiffPosition(patch));
          }

          hunkLinesByFile = map;
        } catch (e) {
          console.error("Failed to load PR patches:", e);
          hunkLinesByFile = undefined;
        }

        await vscode.commands.executeCommand(
          "vscode.diff",
          left,
          right,
          `PR #${prNumber}: ${filePath}`,
        );

        // Load + render inline comments for this file in the diff editor
        try {
          const comments = await loadInlineComments.run(repoRoot, prNumber);
          inlineCommentsUi.renderForDiff(
            left,
            right,
            filePath,
            comments,
            prNumber,
          );
        } catch (e: any) {
          console.error(e);
          // don’t block diff if comments fail
          vscode.window.showWarningMessage(
            "Could not load inline PR comments (see console).",
          );
        }
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

      const confirmed = await confirmAction(
        `Approve PR #${prNumber}?`,
        "This will submit an approval review to GitHub.",
      );
      if (!confirmed) {
        return;
      }

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

        const confirmed = await confirmAction(
          `Request changes on PR #${prNumber}?`,
          "This will submit a 'changes requested' review to GitHub.",
        );
        if (!confirmed) {
          return;
        }

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

        const ctx = currentDiffContext;
        if (!ctx || ctx.prNumber !== prNumber) {
          throw new Error(
            "Open a PR file diff first, then select a line to comment.",
          );
        }

        const ed = vscode.window.activeTextEditor;
        if (!ed) {
          return;
        }

        const uri = ed.document.uri;
        if (uri.scheme !== GitRefContentProvider.scheme) {
          throw new Error(
            "Focus the PR diff editor before adding an inline comment.",
          );
        }

        const uriStr = uri.toString();
        const leftStr = ctx.left.toString();
        const rightStr = ctx.right.toString();

        let side: "LEFT" | "RIGHT";
        if (uriStr === leftStr) {
          side = "LEFT";
        } else if (uriStr === rightStr) {
          side = "RIGHT";
        } else {
          throw new Error(
            "Focus the PR diff tab for this file before commenting.",
          );
        }

        const relPath = getRepoRelPathForEditor(repoRoot, uri);
        if (!relPath) {
          throw new Error("Cannot determine file path for this diff document.");
        }

        const line = ed.selection.active.line + 1;

        const perFile = hunkLinesByFile?.get(relPath);
        if (!perFile) {
          throw new Error(
            "Inline comments are not available for this file (GitHub patch missing: binary or too large). Use a normal PR comment.",
          );
        }

        const position =
          side === "LEFT"
            ? perFile.leftLineToPos.get(line)
            : perFile.rightLineToPos.get(line);

        if (!position) {
          throw new Error(
            "Only lines inside the PR diff hunks are commentable. Pick a line near the changed block in the diff.",
          );
        }

        const body = await vscode.window.showInputBox({
          prompt: `Inline comment (${side}) for ${relPath}:${line}`,
          placeHolder: "Write a short comment…",
        });
        if (!body) {
          return;
        }

        await addInline.run(repoRoot, prNumber, relPath, line, body, side);

        const details = await loadPR.run(repoRoot, prNumber);
        selectedPrDetails = details;
        prDetailsTree.setDetails(details);

        vscode.window.showInformationMessage(
          `Inline comment added to PR #${prNumber}: ${relPath}:${line}`,
        );
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        vscode.window.showErrorMessage(msg);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.pr.resolveThread",
      async (arg: any) => {
        const thread: vscode.CommentThread | undefined = arg?.thread ?? arg;
        if (!thread) {
          return;
        }

        const meta = inlineCommentsUi.getMeta(thread);
        if (!meta?.threadId) {
          vscode.window.showErrorMessage(
            "Cannot resolve: missing GitHub threadId.",
          );
          return;
        }

        await prProvider.setReviewThreadResolved(repoRoot, meta.threadId, true);

        const updated = await loadInlineComments.run(repoRoot, meta.prNumber);
        inlineCommentsUi.renderForDiff(
          meta.leftUri,
          meta.rightUri,
          meta.path,
          updated,
          meta.prNumber,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.pr.unresolveThread",
      async (arg: any) => {
        const thread: vscode.CommentThread | undefined = arg?.thread ?? arg;
        if (!thread) {
          return;
        }

        const meta = inlineCommentsUi.getMeta(thread);
        if (!meta?.threadId) {
          vscode.window.showErrorMessage(
            "Cannot unresolve: missing GitHub threadId.",
          );
          return;
        }

        await prProvider.setReviewThreadResolved(
          repoRoot,
          meta.threadId,
          false,
        );

        const updated = await loadInlineComments.run(repoRoot, meta.prNumber);
        inlineCommentsUi.renderForDiff(
          meta.leftUri,
          meta.rightUri,
          meta.path,
          updated,
          meta.prNumber,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.pr.replyToThread",
      async (arg: any) => {
        const thread: vscode.CommentThread | undefined = arg?.thread ?? arg;
        if (!thread) {
          return;
        }

        const meta = inlineCommentsUi.getMeta(thread);
        if (!meta) {
          vscode.window.showErrorMessage("Missing thread metadata.");
          return;
        }

        inlineCommentsUi.setActiveThread(thread);

        const text = await vscode.window.showInputBox({
          prompt: `Reply to ${meta.path}:${meta.line}`,
          placeHolder: "Write a reply…",
        });
        const body = String(text ?? "").trim();
        if (!body) {
          return;
        }

        await replyInline.run(
          repoRoot,
          meta.prNumber,
          meta.rootCommentId,
          body,
        );

        const updated = await loadInlineComments.run(repoRoot, meta.prNumber);
        inlineCommentsUi.renderForDiff(
          meta.leftUri,
          meta.rightUri,
          meta.path,
          updated,
          meta.prNumber,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.pr.postReplyToActiveThread",
      async (text: string) => {
        const body = String(text ?? "").trim();
        if (!body) {
          return;
        }

        const thread = inlineCommentsUi.getActiveThread();
        if (!thread) {
          vscode.window.showErrorMessage(
            "No thread selected. Click Reply on a thread first.",
          );
          return;
        }

        const meta = inlineCommentsUi.getMeta(thread);
        if (!meta) {
          vscode.window.showErrorMessage("Missing thread metadata.");
          return;
        }

        await replyInline.run(
          repoRoot,
          meta.prNumber,
          meta.rootCommentId,
          body,
        );

        const updated = await loadInlineComments.run(repoRoot, meta.prNumber);
        inlineCommentsUi.renderForDiff(
          meta.leftUri,
          meta.rightUri,
          meta.path,
          updated,
          meta.prNumber,
        );
      },
    ),
  );
}

export function deactivate() {}
