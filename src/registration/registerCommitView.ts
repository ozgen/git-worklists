import * as vscode from "vscode";

import { CommitViewProvider } from "../views/commitViewProvider";
import { Deps } from "../app/types";

import { getHeadMessage, isHeadEmptyVsParent } from "../git/head";
import { pushWithUpstreamFallback } from "../git/push";
import { getStagedPaths } from "../git/staged";
import { runGit } from "../utils/process";
import { info } from "../ui/info";

export function registerCommitView(
  context: vscode.ExtensionContext,
  deps: Deps,
) {
  const commitView = new CommitViewProvider(
    context.extensionUri,
    async ({ message, amend, push }) => {
      const newMsg = message.trim();
      const staged = await getStagedPaths(deps.repoRoot);

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
        await pushWithUpstreamFallback(deps.repoRoot, { amend: amendForPush });
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

          // message-only amend (no need for --allow-empty)
          await runGit(deps.repoRoot, [
            "commit",
            "--amend",
            "--only",
            "-m",
            newMsg,
          ]);
          messageOnlyAmend = true;
        } else {
          // staged amend (fallback if git says it would become empty)
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
      if (!(await confirmPush(amend))) {
        return;
      }

      await doPush(amend);
      await deps.coordinator.requestNow();

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

  deps.commitView = commitView;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CommitViewProvider.viewId,
      commitView,
    ),
  );
}
