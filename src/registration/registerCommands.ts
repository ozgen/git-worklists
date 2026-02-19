import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

import { Deps } from "../app/types";
import { normalizeRepoRelPath, toRepoRelPath } from "../utils/paths";
import { runGit } from "../utils/process";

import { fileExistsAtRef, isNewFileInRepo } from "../git/refs";
import { getStagedPaths, stagePaths, unstagePaths } from "../git/staged";

import { GitShowContentProvider } from "../adapters/vscode/gitShowContentProvider";
import { stageChangelistAll } from "../usecases/stageChangelistAll";
import { unstageChangelistAll } from "../usecases/unstageChangelistAll";
import { openPushPreviewPanel } from "../views/pushPreviewPanel";

export function registerCommands(deps: Deps) {
  const { context } = deps;

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

          const rel = toRepoRelPath(deps.repoRoot, uri);
          if (!rel) {
            return;
          }

          await stagePaths(deps.repoRoot, [rel]);
          await deps.coordinator.requestNow();
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

          const rel = toRepoRelPath(deps.repoRoot, uri);
          if (!rel) {
            return;
          }

          await unstagePaths(deps.repoRoot, [rel]);
          await deps.coordinator.requestNow();
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
          const staged = await getStagedPaths(deps.repoRoot);
          const allStaged = normalized.every((p) => staged.has(p));

          if (!allStaged) {
            await stagePaths(deps.repoRoot, normalized);
          } else {
            await unstagePaths(deps.repoRoot, normalized);
          }

          await deps.coordinator.requestNow();
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
        await deps.coordinator.requestNow();
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
        const rel = toRepoRelPath(deps.repoRoot, uri);
        if (!rel) {
          return;
        }

        await runGit(deps.repoRoot, ["add", "--", normalizeRepoRelPath(rel)]);
        await deps.coordinator.requestNow();
        await vscode.commands.executeCommand("gitWorklists.openDiff", uri);
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.unstagePath",
      async (uri: vscode.Uri) => {
        const rel = toRepoRelPath(deps.repoRoot, uri);
        if (!rel) {
          return;
        }

        await runGit(deps.repoRoot, [
          "restore",
          "--staged",
          "--",
          normalizeRepoRelPath(rel),
        ]);

        await deps.coordinator.requestNow();
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
          await deps.createChangelist.run(deps.repoRoot, name);
          await deps.coordinator.requestNow();
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
    const state = await deps.store.load(deps.repoRoot);
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
          await deps.moveFiles.run(deps.repoRoot, [p], target.id);
          await deps.coordinator.requestNow();
        } catch (e: any) {
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),

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
          await deps.moveFiles.run(
            deps.repoRoot,
            files.map(normalizeRepoRelPath),
            target.id,
          );
          await deps.coordinator.requestNow();
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
          await deps.deleteChangelist.run(deps.repoRoot, listId);
          await deps.coordinator.requestNow();
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
          const isNew = await isNewFileInRepo(deps.repoRoot, rel);

          if (status === "unversioned") {
            const ok = await vscode.window.showWarningMessage(
              "Delete unversioned file?",
              { modal: true, detail: rel },
              "Delete",
            );
            if (ok !== "Delete") {
              return;
            }

            await fs.rm(path.join(deps.repoRoot, rel), {
              recursive: true,
              force: true,
            });
            await deps.coordinator.requestNow();
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

            await runGit(deps.repoRoot, [
              "restore",
              "--staged",
              "--worktree",
              "--",
              rel,
            ]);
            await deps.coordinator.requestNow();
            return;
          }

          await runGit(deps.repoRoot, [
            "restore",
            "--staged",
            "--worktree",
            "--",
            rel,
          ]);
          await deps.coordinator.requestNow();
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
    vscode.commands.registerCommand(
      "gitWorklists.openDiff",
      async (uri: vscode.Uri) => {
        if (!uri) {
          return;
        }

        const rel = toRepoRelPath(deps.repoRoot, uri);
        if (!rel) {
          await vscode.commands.executeCommand("vscode.open", uri);
          return;
        }

        const repoRel = normalizeRepoRelPath(rel);
        const ref = "HEAD";

        const existsInHead = await fileExistsAtRef(deps.repoRoot, ref, repoRel);
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

        deps.diffTabTracker.track(uri);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitWorklists.closeDiffTabs", async () => {
      await deps.closeDiffTabs.run();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.stageChangelistAll",
      async (group: any) => {
        if (!group?.list?.files) {
          return;
        }

        const repoRoot = await deps.git.tryGetRepoRoot(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
        );
        if (!repoRoot) {
          vscode.window.showErrorMessage("No Git repository found.");
          return;
        }

        const ok = await vscode.window.showWarningMessage(
          `Stage all files in "${group.list.name}"?`,
          { modal: true },
          "Stage",
        );
        if (ok !== "Stage") {
          return;
        }

        await stageChangelistAll(deps.git, repoRoot, group.list.files);
        await vscode.commands.executeCommand("gitWorklists.refresh");
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.unstageChangelistAll",
      async (group: any) => {
        if (!group?.list?.files) {
          return;
        }

        const repoRoot = await deps.git.tryGetRepoRoot(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
        );
        if (!repoRoot) {
          vscode.window.showErrorMessage("No Git repository found.");
          return;
        }

        const ok = await vscode.window.showWarningMessage(
          `Unstage all files in "${group.list.name}"? (Working tree changes will be kept.)`,
          { modal: true },
          "Unstage",
        );
        if (ok !== "Unstage") {
          return;
        }

        await unstageChangelistAll(deps.git, repoRoot, group.list.files);
        await vscode.commands.executeCommand("gitWorklists.refresh");
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.pushWithPreview",
      async () => {
        try {
          const repoRoot = deps.repoRoot;

          const decision = await openPushPreviewPanel(deps, {
            repoRoot,
            forceWithLease: false,
          });

          if (decision !== "push") {
            return;
          }

          await runGit(repoRoot, ["push"]);
          await deps.coordinator.requestNow();
        } catch (e) {
          console.error(e);
          vscode.window.showErrorMessage(
            "Git Worklists: push preview failed (see console)",
          );
        }
      },
    ),
  );
}
