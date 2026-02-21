import * as vscode from "vscode";

import { Deps } from "../app/types";
import { CommitViewProvider } from "../views/commitViewProvider";

import { getHeadMessage, isHeadEmptyVsParent } from "../git/head";
import { pushWithUpstreamFallback } from "../git/push";
import { getStagedPaths } from "../git/staged";
import { info } from "../ui/info";
import { runGit } from "../utils/process";

import { openPushPreviewPanel } from "../views/pushPreviewPanel";

export function registerCommitView(
  context: vscode.ExtensionContext,
  deps: Deps,
) {
  const commitView = new CommitViewProvider(
    context.extensionUri,
    async ({ message, amend, push }) => {
      const newMsg = message.trim();
      const staged = await getStagedPaths(deps.repoRoot);
      // Restage staged paths to ensure the commit includes the latest content (handles AM/MM).
      await deps.restageAlreadyStaged.run(deps.repoRoot, staged);

      const closeAfterCommit = async () => {
        if (deps.settings.closeDiffTabsAfterCommit()) {
          await deps.diffTabTracker.closeTrackedTabs();
        }
      };

      const closeAfterPush = async () => {
        if (deps.settings.closeDiffTabsAfterPush()) {
          await deps.diffTabTracker.closeTrackedTabs();
        }
      };

      // TODO: this func is now legacy, currenty the extention
      // used openPushPreviewPanel webview panel
      const confirmPushFallbackModal = async (forceWithLease: boolean) => {
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

      const doPush = async (amendForPush: boolean) => {
        await pushWithUpstreamFallback(deps.repoRoot, { amend: amendForPush });
        await closeAfterPush();
      };

      const confirmPushViaPanelOrFallback = async (
        forceWithLease: boolean,
      ): Promise<boolean> => {
        try {
          const upstreamRef = await deps.git.tryGetUpstreamRef(deps.repoRoot);
          const commits = await deps.git.listOutgoingCommits(deps.repoRoot);

          const upstreamLabel =
            upstreamRef ?? "remote (no upstream – will set on push)";

          if (commits.length === 0) {
            void vscode.window.showInformationMessage(
              upstreamRef
                ? `Nothing to push (already up to date with ${upstreamRef}).`
                : "Nothing to push.",
            );
            return false;
          }

          // If only 1 outgoing commit -> simple modal (no panel)
          if (commits.length === 1) {
            const c = commits[0];
            const ok = await vscode.window.showWarningMessage(
              forceWithLease
                ? `Push 1 commit (force-with-lease) to ${upstreamLabel}?`
                : `Push 1 commit to ${upstreamLabel}?`,
              {
                modal: true,
                detail: `${c.shortHash} ${c.subject}`,
              },
              "Push",
            );
            return ok === "Push";
          }

          // 2+ commits -> show panel (panel itself can show upstreamLabel)
          const decision = await openPushPreviewPanel(deps, {
            repoRoot: deps.repoRoot,
            forceWithLease,
          });
          return decision === "push";
        } catch (e) {
          // Real errors only (git failure, unexpected parsing, etc.)
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
        }
      };

      // -------------------------
      // Push-only path
      // -------------------------
      if (!amend && push && staged.size === 0) {
        const ok = await confirmPushViaPanelOrFallback(false);
        if (!ok) {
          return;
        }

        await doPush(false);
        await deps.coordinator.requestNow();
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
        const oldMsg = await getHeadMessage(deps.repoRoot);
        info(oldMsg);

        if (staged.size === 0) {
          if (newMsg === oldMsg) {
            const headEmpty = await isHeadEmptyVsParent(deps.repoRoot);
            throw new Error(
              headEmpty
                ? "Nothing to amend: last commit is empty and message is unchanged."
                : "Nothing to amend: message unchanged and nothing staged.",
            );
          }

          await runGit(deps.repoRoot, [
            "commit",
            "--amend",
            "--only",
            "-m",
            newMsg,
          ]);
          messageOnlyAmend = true;
        } else {
          try {
            await runGit(deps.repoRoot, ["commit", "--amend", "-m", newMsg]);
          } catch (e) {
            const msg = String((e as any)?.message ?? e);
            if (msg.includes("would make it empty")) {
              await runGit(deps.repoRoot, [
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
        await runGit(deps.repoRoot, ["commit", "-m", newMsg]);
      }

      await closeAfterCommit();
      await deps.coordinator.requestNow();

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
      const ok = await confirmPushViaPanelOrFallback(amend);
      if (!ok) {
        return;
      }

      await doPush(amend);
      await deps.coordinator.requestNow();

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

  deps.commitView = commitView;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CommitViewProvider.viewId,
      commitView,
    ),
  );
}
