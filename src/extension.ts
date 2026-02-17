import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

import { normalizeRepoRelPath, toRepoRelPath } from "./utils/paths";
import { runGit, runGitCapture } from "./utils/process";

import { GitCliClient } from "./adapters/git/gitCliClient";
import {
  PersistedState,
  WorkspaceStateStore,
} from "./adapters/storage/workspaceStateStore";

import { VsCodeFsStat } from "./adapters/vscode/fsStat";
import { VsCodePrompt } from "./adapters/vscode/prompt";
import { VsCodeSettings } from "./adapters/vscode/settings";

import { CreateChangelist } from "./usecases/createChangelist";
import { DeleteChangelist } from "./usecases/deleteChangelist";
import { LoadOrInitState } from "./usecases/loadOrInitState";
import { MoveFilesToChangelist } from "./usecases/moveFilesToChangelist";
import { ReconcileWithGitStatus } from "./usecases/reconcileWithGitStatus";

import { ChangelistTreeProvider } from "./views/changelistTreeProvider";
import { CommitViewProvider } from "./views/commitViewProvider";
import { WorklistDecorationProvider } from "./views/worklistDecorationProvider";

import { StashesTreeProvider } from "./views/stash/stashesTreeProvider";

import { AutoRefreshController } from "./adapters/vscode/autoRefreshController";
import { DiffTabTracker } from "./adapters/vscode/diffTabTracker";
import { GitShowContentProvider } from "./adapters/vscode/gitShowContentProvider";
import { RefreshCoordinator } from "./core/refresh/refreshCoordinator";
import { CloseDiffTabs } from "./usecases/closeDiffTabs";
import { HandleNewFilesCreated } from "./usecases/handleNewFilesCreated";
import { CreateStashForChangelist } from "./usecases/stash/createStashForChangelist";

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

async function getCurrentBranch(repoRoot: string): Promise<string> {
  const out = await runGitCapture(repoRoot, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  const branch = out.trim();

  if (!branch || branch === "HEAD") {
    throw new Error("Detached HEAD: cannot push without a branch.");
  }
  return branch;
}

function looksLikeNoUpstream(err: unknown): boolean {
  const msg = String(err ?? "");
  return (
    msg.includes("no upstream branch") ||
    msg.includes("has no upstream branch") ||
    msg.includes("set the remote as upstream") ||
    (msg.includes("The current branch") && msg.includes("has no upstream"))
  );
}

async function pushWithUpstreamFallback(
  repoRoot: string,
  { amend }: { amend: boolean },
): Promise<void> {
  try {
    await runGit(repoRoot, amend ? ["push", "--force-with-lease"] : ["push"]);
    return;
  } catch (e) {
    if (!looksLikeNoUpstream(e)) {
      throw e;
    }
  }

  const branch = await getCurrentBranch(repoRoot);

  const baseArgs = ["push", "-u", "origin", branch];
  const args = amend ? [...baseArgs, "--force-with-lease"] : baseArgs;

  await runGit(repoRoot, args);
}

function computeTotalWorklistCount(state: PersistedState | undefined): number {
  if (!state || state.version !== 1) {
    return 0;
  }

  const all = new Set<string>();
  for (const l of state.lists) {
    for (const f of l.files ?? []) {
      all.add(f.replace(/\\/g, "/"));
    }
  }
  return all.size;
}

async function isNewFileInRepo(
  repoRoot: string,
  rel: string,
): Promise<boolean> {
  try {
    await runGit(repoRoot, ["cat-file", "-e", `HEAD:${rel}`]);
    return false;
  } catch {
    return true;
  }
}

async function fileExistsAtRef(
  repoRoot: string,
  ref: string,
  rel: string,
): Promise<boolean> {
  try {
    await runGit(repoRoot, ["cat-file", "-e", `${ref}:${rel}`]);
    return true;
  } catch {
    return false;
  }
}

function info(msg: string) {
  vscode.window.showInformationMessage(msg);
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
  const fsStat = new VsCodeFsStat();
  const settings = new VsCodeSettings();
  const prompt = new VsCodePrompt();

  const diffTabTracker = new DiffTabTracker();
  const closeDiffTabs = new CloseDiffTabs(diffTabTracker);

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
  const stashesProvider = new StashesTreeProvider(repoRoot, git);

  const showProvider = new GitShowContentProvider(git, repoRoot);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      GitShowContentProvider.scheme,
      showProvider,
    ),
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
      const staged = await getStagedPaths(repoRoot);

      const closeAfterCommit = async () => {
        if (settings.closeDiffTabsAfterCommit()) {
          await diffTabTracker.closeTrackedTabs();
        }
      };

      const closeAfterPush = async () => {
        if (settings.closeDiffTabsAfterPush()) {
          await diffTabTracker.closeTrackedTabs();
        }
      };

      const confirmPush = async (forceWithLease: boolean) => {
        const ok = await vscode.window.showWarningMessage(
          forceWithLease
            ? "Push amended commit (force-with-lease)?"
            : "Push commits to remote?",
          {
            modal: true,
            detail: forceWithLease
              ? "This will run: git push --force-with-lease"
              : "This will run: git push",
          },
          "Push",
        );
        return ok === "Push";
      };

      const pushOnlyConfirm = async () => {
        const ok = await vscode.window.showWarningMessage(
          "No staged files. Push existing local commits to remote?",
          { modal: true, detail: "This will run: git push" },
          "Push",
        );
        return ok === "Push";
      };

      const doPush = async (amendForPush: boolean) => {
        await pushWithUpstreamFallback(repoRoot, { amend: amendForPush });
        await closeAfterPush();
      };

      // -------------------------
      // Push-only path
      // -------------------------
      if (!amend && push && staged.size === 0) {
        if (!(await pushOnlyConfirm())) {
          return;
        }

        await doPush(false);
        info("Pushed to remote.");
        return;
      }

      if (!newMsg) {
        throw new Error("Commit message is empty.");
      }

      let messageOnlyAmend = false;

      // -------------------------
      // Amend / Commit
      // -------------------------
      if (amend) {
        const oldMsg = await getHeadMessage(repoRoot);
        info(oldMsg);

        if (staged.size === 0) {
          if (newMsg === oldMsg) {
            const headEmpty = await isHeadEmptyVsParent(repoRoot);
            throw new Error(
              headEmpty
                ? "Nothing to amend: last commit is empty and message is unchanged."
                : "Nothing to amend: message unchanged and nothing staged.",
            );
          }

          // message-only amend (no need for --allow-empty)
          await runGit(repoRoot, ["commit", "--amend", "--only", "-m", newMsg]);
          messageOnlyAmend = true;
        } else {
          // staged amend (fallback if git says it would become empty)
          try {
            await runGit(repoRoot, ["commit", "--amend", "-m", newMsg]);
          } catch (e) {
            const msg = String((e as any)?.message ?? e);
            if (msg.includes("would make it empty")) {
              await runGit(repoRoot, [
                "commit",
                "--amend",
                "--allow-empty",
                "-m",
                newMsg,
              ]);
            } else {
              throw e;
            }
          }
        }
      } else {
        if (staged.size === 0) {
          throw new Error("No staged files. Stage files first.");
        }
        await runGit(repoRoot, ["commit", "-m", newMsg]);
      }

      await closeAfterCommit();

      // -------------------------
      // No push requested
      // -------------------------
      if (!push) {
        if (amend) {
          info(
            messageOnlyAmend ? "Amended commit message." : "Amended commit.",
          );
        } else {
          info("Created commit.");
        }
        return;
      }

      // -------------------------
      // Push after commit/amend
      // -------------------------
      if (!(await confirmPush(amend))) {
        return;
      }

      await doPush(amend);

      // One final success notification (no duplicates)
      if (amend) {
        info(
          messageOnlyAmend
            ? "Amended message and pushed."
            : "Amended and pushed.",
        );
      } else {
        info("Committed and pushed.");
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

    const state = await store.load(repoRoot);
    const count = computeTotalWorklistCount(
      state as PersistedState | undefined,
    );

    treeView.badge =
      count > 0
        ? { value: count, tooltip: "Files in Git Worklists" }
        : undefined;
  };

  const coordinator = new RefreshCoordinator(doRefresh, 200);
  context.subscriptions.push(coordinator);

  // First refresh
  await coordinator.requestNow();

  const newFileHandler = new HandleNewFilesCreated({
    repoRoot,
    moveFiles,
    coordinator,
    settings,
    prompt,
  });

  // Auto refresh signals
  const auto = new AutoRefreshController(
    { workspace: vscode.workspace, RelativePattern: vscode.RelativePattern },
    repoRoot,
    gitDir,
    doRefresh,
  );

  auto.start();
  context.subscriptions.push(auto);

  // ----------------------------
  // Staging helpers (checkboxes + commands)
  // ----------------------------
  async function getStagedPaths(repoRoot: string): Promise<Set<string>> {
    const out = await runGitCapture(repoRoot, [
      "status",
      "--porcelain=v1",
      "-z",
    ]);

    const staged = new Set<string>();
    const entries = out.split("\0").filter(Boolean);

    for (const e of entries) {
      // v1 format: XY<space>path
      // "M  file" => staged (index)
      // " M file" => not staged (working tree)
      // "?? file" => untracked
      const xy = e.slice(0, 2);
      const p = e.slice(3);
      if (!p) {
        continue;
      }

      const x = xy[0]; // index status
      if (x !== " " && x !== "?") {
        staged.add(normalizeRepoRelPath(p));
      }
    }

    return staged;
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

        //Refresh
        await coordinator.requestNow();
        // Open diff (HEAD Working Tree)
        await vscode.commands.executeCommand("gitWorklists.openDiff", uri);
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

        //Refresh
        await coordinator.requestNow();
        // Open diff (HEAD Working Tree)
        await vscode.commands.executeCommand("gitWorklists.openDiff", uri);
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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.file.discard",
      async (node: any) => {
        try {
          const rel =
            typeof node?.repoRelativePath === "string"
              ? normalizeRepoRelPath(node.repoRelativePath)
              : "";
          if (!rel) {
            return;
          }

          const status = node?.workStatus as
            | "unversioned"
            | "tracked"
            | undefined;

          const isNew = await isNewFileInRepo(repoRoot, rel);

          if (status === "unversioned") {
            const ok = await vscode.window.showWarningMessage(
              "Delete unversioned file?",
              { modal: true, detail: rel },
              "Delete",
            );
            if (ok !== "Delete") {
              return;
            }

            await fs.rm(path.join(repoRoot, rel), {
              recursive: true,
              force: true,
            });
            await coordinator.requestNow();
            return;
          }

          if (isNew) {
            const ok = await vscode.window.showWarningMessage(
              "Discard will delete this newly added file. Continue?",
              { modal: true, detail: rel },
              "Delete",
            );
            if (ok !== "Delete") {
              return;
            }

            await runGit(repoRoot, [
              "restore",
              "--staged",
              "--worktree",
              "--",
              rel,
            ]);
            await coordinator.requestNow();
            return;
          }

          // tracked normal
          await runGit(repoRoot, [
            "restore",
            "--staged",
            "--worktree",
            "--",
            rel,
          ]);
          await coordinator.requestNow();
        } catch (e) {
          console.error(e);
          vscode.window.showErrorMessage(
            "Git Worklists: discard failed (see console)",
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidCreateFiles(async (e) => {
      try {
        // filter folders out (files only)
        const filesOnly = await fsStat.filterOnlyFiles(e.files);
        if (filesOnly.length === 0) {
          return;
        }

        await newFileHandler.run(filesOnly);
      } catch (err) {
        console.error(err);
        vscode.window.showErrorMessage(
          "Git Worklists: failed handling new file (see console)",
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.openDiff",
      async (uri: vscode.Uri) => {
        if (!uri) {
          return;
        }

        const rel = toRepoRelPath(repoRoot, uri);
        if (!rel) {
          await vscode.commands.executeCommand("vscode.open", uri);
          return;
        }

        const repoRel = normalizeRepoRelPath(rel);
        const ref = "HEAD";

        const existsInHead = await fileExistsAtRef(repoRoot, ref, repoRel);

        if (!existsInHead) {
          await vscode.commands.executeCommand("vscode.open", uri);
          return;
        }

        const leftUri = vscode.Uri.parse(
          `${GitShowContentProvider.scheme}:/${encodeURIComponent(ref)}/${encodeURIComponent(repoRel)}`,
        );

        await vscode.commands.executeCommand(
          "vscode.diff",
          leftUri,
          uri,
          `${repoRel} (${ref} ↔ Working Tree)`,
        );

        //add track of opened tabs
        diffTabTracker.track(uri);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitWorklists.closeDiffTabs", async () => {
      await closeDiffTabs.run();
    }),
  );

  // ----------------------------------
  // Commands (context menus) for Stash
  // ----------------------------------

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "gitWorklists.stashes",
      stashesProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitWorklists.stash.refresh", () => {
      stashesProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.stash.createFromChangelist",
      async (node: any) => {
        try {
          const changelistId =
            typeof node?.list?.id === "string" ? node.list.id : "";
          const label =
            typeof node?.list?.name === "string"
              ? node.list.name
              : "changelist";

          if (!changelistId) {
            vscode.window.showErrorMessage(
              "Git Worklists: could not determine changelist id from selection.",
            );
            return;
          }

          const message = await vscode.window.showInputBox({
            prompt: "Stash message (optional)",
            placeHolder: "WIP",
          });

          const uc = new CreateStashForChangelist(git, store);

          const res = await uc.run({
            repoRootFsPath: repoRoot,
            changelistId,
            message,
          });

          const extra = res.skippedUntrackedCount
            ? ` (skipped ${res.skippedUntrackedCount} untracked)`
            : "";

          vscode.window.showInformationMessage(
            `Stashed ${res.stashedCount} file(s) from ${label}${extra}.`,
          );

          coordinator.trigger();
          stashesProvider.refresh();
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.stash.apply",
      async (node: any) => {
        const ref = typeof node?.stash?.ref === "string" ? node.stash.ref : "";
        if (!ref) {
          return;
        }

        try {
          await git.stashApply(repoRoot, ref);
          coordinator.trigger();
          stashesProvider.refresh();
          vscode.window.showInformationMessage(`Applied ${ref}.`);
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.stash.pop",
      async (node: any) => {
        const ref = typeof node?.stash?.ref === "string" ? node.stash.ref : "";
        if (!ref) {
          return;
        }

        try {
          await git.stashPop(repoRoot, ref);
          coordinator.trigger();
          stashesProvider.refresh();
          vscode.window.showInformationMessage(`Popped ${ref}.`);
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.stash.drop",
      async (node: any) => {
        const ref = typeof node?.stash?.ref === "string" ? node.stash.ref : "";
        if (!ref) {
          return;
        }

        const ok = await vscode.window.showWarningMessage(
          `Delete ${ref}?`,
          { modal: true, detail: "This will run: git stash drop" },
          "Delete",
        );
        if (ok !== "Delete") {
          return;
        }

        try {
          await git.stashDrop(repoRoot, ref);
          coordinator.trigger();
          stashesProvider.refresh();
          vscode.window.showInformationMessage(`Deleted ${ref}.`);
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),
  );
}

export function deactivate() {}
