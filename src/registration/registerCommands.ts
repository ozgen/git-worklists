import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

import { Deps } from "../app/types";
import { normalizeRepoRelPath, toRepoRelPath } from "../utils/paths";

import { GitShowContentProvider } from "../adapters/vscode/gitShowContentProvider";
import { SystemChangelist } from "../core/changelist/systemChangelist";
import { stageChangelistAll } from "../usecases/stageChangelistAll";
import { unstageChangelistAll } from "../usecases/unstageChangelistAll";
import { buildPatchForLineRange } from "../utils/patchBuilder";
import { openPushPreviewPanel } from "../views/pushPreviewPanel";

import {
  isValidBookmarkSlot,
  type BookmarkSlot,
} from "../core/bookmark/bookmark";

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

          await deps.git.stageMany(deps.repoRoot, [rel]);
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

          await deps.git.unstageMany(deps.repoRoot, [rel]);
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
          const staged = await deps.git.getStagedPaths(deps.repoRoot);
          const allStaged = normalized.every((p) => staged.has(p));

          if (!allStaged) {
            await deps.git.stageMany(deps.repoRoot, normalized);
          } else {
            await deps.git.unstageMany(deps.repoRoot, normalized);
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

        await deps.git.stageMany(deps.repoRoot, [normalizeRepoRelPath(rel)]);
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

        await deps.git.unstageMany(deps.repoRoot, [normalizeRepoRelPath(rel)]);
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

  function toBookmarkSlot(value: number): BookmarkSlot {
    if (!isValidBookmarkSlot(value)) {
      throw new Error(`Invalid bookmark slot: ${value}`);
    }
    return value;
  }

  function getBookmarkTargetFromArg(arg: any) {
    if (typeof arg?.repoRelativePath === "string") {
      const rel = normalizeRepoRelPath(arg.repoRelativePath);
      if (!rel) {
        return undefined;
      }

      const editorTarget = getBookmarkTargetFromEditor();
      if (
        editorTarget &&
        normalizeRepoRelPath(editorTarget.repoRelativePath) === rel
      ) {
        return editorTarget;
      }

      return {
        repoRelativePath: rel,
        line: 0,
        column: 0,
      };
    }

    const uri: vscode.Uri | undefined =
      arg instanceof vscode.Uri
        ? arg
        : arg?.resourceUri instanceof vscode.Uri
          ? arg.resourceUri
          : undefined;

    if (uri?.scheme === "file") {
      const targetFromUri = deps.bookmarkEditor.getTargetFromFsPath(
        deps.repoRoot,
        uri.fsPath,
        0,
        0,
      );

      if (!targetFromUri) {
        return undefined;
      }

      const editorTarget = getBookmarkTargetFromEditor();
      if (
        editorTarget &&
        normalizeRepoRelPath(editorTarget.repoRelativePath) ===
          normalizeRepoRelPath(targetFromUri.repoRelativePath)
      ) {
        return editorTarget;
      }

      return targetFromUri;
    }

    return undefined;
  }

  function getBookmarkTargetFromEditor() {
    return deps.bookmarkEditor.getActiveEditorTarget(deps.repoRoot);
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
      "gitWorklists.renameChangelist",
      async (node: any) => {
        const listId = typeof node?.list?.id === "string" ? node.list.id : "";
        const currentName =
          typeof node?.list?.name === "string" ? node.list.name : "";
        if (!listId) {
          return;
        }

        const name = await vscode.window.showInputBox({
          prompt: "New changelist name",
          value: currentName,
        });
        if (!name) {
          return;
        }

        try {
          await deps.renameChangelist.run(deps.repoRoot, listId, name);
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
          const isNew = await deps.git.isNewFileInRepo(deps.repoRoot, rel);

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

            await deps.git.discardFiles(deps.repoRoot, [rel]);
            await deps.coordinator.requestNow();
            return;
          }

          await deps.git.discardFiles(deps.repoRoot, [rel]);
          await deps.coordinator.requestNow();
        } catch (e) {
          console.error(e);
          vscode.window.showErrorMessage(
            "Git Worklists: discard failed (see console)",
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.changelist.discardAll",
      async (node: any) => {
        try {
          const list = node?.list;
          const listId: string = String(list?.id ?? "");
          const rawFiles: unknown = list?.files;

          const paths = Array.isArray(rawFiles)
            ? rawFiles
                .filter((p: any) => typeof p === "string")
                .map((p: string) => normalizeRepoRelPath(p))
                .filter(Boolean)
            : [];

          if (paths.length === 0) {
            return;
          }

          const isUnversionedList = listId === SystemChangelist.Unversioned;

          const unversioned = isUnversionedList ? paths : [];
          const tracked = isUnversionedList ? [] : paths;

          const newlyAdded: string[] = [];
          const normalTracked: string[] = [];

          for (const rel of tracked) {
            const isNew = await deps.git.isNewFileInRepo(deps.repoRoot, rel);
            if (isNew) {
              newlyAdded.push(rel);
            } else {
              normalTracked.push(rel);
            }
          }

          if (unversioned.length > 0) {
            const ok = await vscode.window.showWarningMessage(
              `Delete ${unversioned.length} unversioned file(s)?`,
              {
                modal: true,
                detail:
                  unversioned.slice(0, 10).join("\n") +
                  (unversioned.length > 10 ? "\n…" : ""),
              },
              "Delete",
            );
            if (ok !== "Delete") {
              return;
            }
          }

          if (newlyAdded.length > 0) {
            const ok = await vscode.window.showWarningMessage(
              `Discard will delete ${newlyAdded.length} newly added file(s). Continue?`,
              {
                modal: true,
                detail:
                  newlyAdded.slice(0, 10).join("\n") +
                  (newlyAdded.length > 10 ? "\n…" : ""),
              },
              "Delete",
            );
            if (ok !== "Delete") {
              return;
            }
          }

          if (normalTracked.length > 0) {
            const ok = await vscode.window.showWarningMessage(
              `Discard changes in ${normalTracked.length} file(s)?`,
              {
                modal: true,
                detail:
                  normalTracked.slice(0, 10).join("\n") +
                  (normalTracked.length > 10 ? "\n…" : ""),
              },
              "Discard",
            );
            if (ok !== "Discard") {
              return;
            }
          }

          // --- Execute ---
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Window,
              title: "Git Worklists: discarding changes…",
            },
            async () => {
              if (unversioned.length > 0) {
                await Promise.all(
                  unversioned.map((rel) =>
                    fs.rm(path.join(deps.repoRoot, rel), {
                      recursive: true,
                      force: true,
                    }),
                  ),
                );
              }

              const toRestore = [...newlyAdded, ...normalTracked];
              if (toRestore.length > 0) {
                await deps.git.discardFiles(deps.repoRoot, toRestore);
              }

              await deps.coordinator.requestNow();
            },
          );
        } catch (e) {
          console.error(e);
          void vscode.window.showErrorMessage(
            "Git Worklists: discard all failed (see console)",
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

        const existsInHead = await deps.git.fileExistsAtRef(
          deps.repoRoot,
          ref,
          repoRel,
        );
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
      "gitWorklists.stageSelectedLines",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
          vscode.window.showWarningMessage(
            "Select lines in the diff editor first.",
          );
          return;
        }

        const uri = editor.document.uri;
        if (uri.scheme !== "file") {
          vscode.window.showWarningMessage(
            "Open a diff from the Git Worklists tree view and select lines in the right pane.",
          );
          return;
        }

        const rel = toRepoRelPath(deps.repoRoot, uri);
        if (!rel) {
          vscode.window.showWarningMessage(
            "File is not in the current repository.",
          );
          return;
        }

        const selStart = editor.selection.start.line + 1;
        const selEnd =
          editor.selection.end.character === 0
            ? editor.selection.end.line
            : editor.selection.end.line + 1;

        const fullDiff = await deps.git.getDiffUnstaged(deps.repoRoot, rel);
        if (!fullDiff.trim()) {
          vscode.window.showInformationMessage(
            "No unstaged changes for this file.",
          );
          return;
        }

        const patch = buildPatchForLineRange(fullDiff, selStart, selEnd);
        if (!patch) {
          vscode.window.showInformationMessage(
            "No changes in the selected range.",
          );
          return;
        }

        try {
          await deps.git.applyPatchStaged(deps.repoRoot, patch);
          deps.coordinator.trigger();
        } catch (e: any) {
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.stageChangelistAll",
      async (group: any) => {
        if (!group?.list?.files) {
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

        await stageChangelistAll(deps.git, deps.repoRoot, group.list.files);
        await vscode.commands.executeCommand("gitWorklists.refresh");
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.unstageChangelistAll",
      async (group: any) => {
        if (!group?.list?.files) {
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

        await unstageChangelistAll(deps.git, deps.repoRoot, group.list.files);
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

          await deps.git.push(repoRoot, { amend: false });
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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.file.openSource",
      async (node: any) => {
        const rel =
          typeof node?.repoRelativePath === "string"
            ? normalizeRepoRelPath(node.repoRelativePath)
            : "";
        if (!rel) {
          return;
        }

        const abs = vscode.Uri.file(path.join(deps.repoRoot, rel));

        // Opens the real file (source) in an editor tab
        await vscode.window.showTextDocument(abs, { preview: true });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.moveAllStagedFilesToChangelist",
      async () => {
        try {
          const staged = await deps.git.getStagedPaths(deps.repoRoot);
          const stagedPaths = [...staged].map(normalizeRepoRelPath);

          if (stagedPaths.length === 0) {
            vscode.window.showInformationMessage("No staged files.");
            return;
          }

          const target = await pickTargetList();
          if (!target) {
            return;
          }

          await deps.moveFiles.run(deps.repoRoot, stagedPaths, target.id);
          await deps.coordinator.requestNow();
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.stashAllStagedFiles",
      async () => {
        try {
          const staged = await deps.git.getStagedPaths(deps.repoRoot);
          const stagedPaths = [...staged].map(normalizeRepoRelPath);

          if (stagedPaths.length === 0) {
            vscode.window.showInformationMessage("No staged files.");
            return;
          }

          const message = await vscode.window.showInputBox({
            prompt: "Stash message (optional)",
            placeHolder: "WIP",
          });

          if (message === undefined) {
            return;
          }

          const userMsg = message.trim();
          const msg = userMsg ? `GW:staged ${userMsg}` : `GW:staged`;

          await deps.git.stashPushPaths(deps.repoRoot, msg, stagedPaths);

          vscode.window.showInformationMessage(
            `Stashed ${stagedPaths.length} staged file(s).`,
          );

          deps.coordinator.trigger();
          deps.stashesProvider.refresh();
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitWorklists.switchRepoRoot", async () => {
      try {
        const roots = await deps.listRepoRoots();

        if (roots.length <= 1) {
          vscode.window.showInformationMessage(
            "Git Worklists: no additional Git roots found in this workspace.",
          );
          return;
        }

        const items = roots.map((root) => ({
          label: path.basename(root),
          description: root === deps.repoRoot ? "current" : undefined,
          detail: root,
          root,
        }));

        const picked = await vscode.window.showQuickPick(items, {
          title: "Switch Git Root",
          placeHolder: "Select the active Git root for Git Worklists",
        });

        if (!picked || picked.root === deps.repoRoot) {
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Window,
            title: "Git Worklists: switching repository…",
          },
          () => deps.switchRepoRoot(picked.root),
        );
      } catch (e) {
        console.error(e);
        vscode.window.showErrorMessage(
          "Git Worklists: failed to switch Git root (see console)",
        );
      }
    }),
  );

  for (let i = 1; i <= 9; i += 1) {
    const slot = toBookmarkSlot(i);

    context.subscriptions.push(
      vscode.commands.registerCommand(
        `gitWorklists.bookmark.set${i}`,
        async () => {
          try {
            const target = getBookmarkTargetFromEditor();
            if (!target) {
              await deps.prompt.showWarning(
                "No active editor bookmark target found.",
              );
              return;
            }

            await deps.setBookmark.run({
              repoRoot: deps.repoRoot,
              target,
              slot,
            });
            await deps.bookmarkDeco.refreshVisibleEditors();
          } catch (e: any) {
            console.error(e);
            vscode.window.showErrorMessage(String(e?.message ?? e));
          }
        },
      ),

      vscode.commands.registerCommand(
        `gitWorklists.bookmark.jump${i}`,
        async () => {
          try {
            await deps.jumpToBookmark.run(deps.repoRoot, slot);
          } catch (e: any) {
            console.error(e);
            vscode.window.showErrorMessage(String(e?.message ?? e));
          }
        },
      ),

      vscode.commands.registerCommand(
        `gitWorklists.bookmark.clear${i}`,
        async () => {
          try {
            await deps.clearBookmark.run(deps.repoRoot, slot);
          } catch (e: any) {
            console.error(e);
            vscode.window.showErrorMessage(String(e?.message ?? e));
          }
        },
      ),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitWorklists.bookmark.set",
      async (node: any) => {
        try {
          const targetFromArg = getBookmarkTargetFromArg(node);
          const target = targetFromArg ?? getBookmarkTargetFromEditor();

          if (!target) {
            await deps.prompt.showWarning(
              "Could not resolve a bookmark target.",
            );
            return;
          }

          await deps.setBookmark.run({
            repoRoot: deps.repoRoot,
            target,
          });

          if (targetFromArg) {
            await deps.bookmarkEditor.openTarget(deps.repoRoot, target);
          }

          await deps.bookmarkDeco.refreshVisibleEditors();
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),

    vscode.commands.registerCommand("gitWorklists.bookmark.clear", async () => {
      try {
        await deps.clearBookmark.run(deps.repoRoot);
        await deps.bookmarkDeco.refreshVisibleEditors();
      } catch (e: any) {
        console.error(e);
        vscode.window.showErrorMessage(String(e?.message ?? e));
      }
    }),

    vscode.commands.registerCommand(
      "gitWorklists.bookmark.clearAll",
      async () => {
        try {
          await deps.clearAllBookmarks.run(deps.repoRoot);
          await deps.bookmarkDeco.refreshVisibleEditors();
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),
  );
}
