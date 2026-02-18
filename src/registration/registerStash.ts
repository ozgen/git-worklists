import * as vscode from "vscode";
import { Deps } from "../app/types";
import { CreateStashForChangelist } from "../usecases/stash/createStashForChangelist";

export function registerStash(deps: Deps) {
  const { context } = deps;

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "gitWorklists.stashes",
      deps.stashesProvider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitWorklists.stash.refresh", () => {
      deps.stashesProvider.refresh();
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

          const uc = new CreateStashForChangelist(deps.git, deps.store);

          const res = await uc.run({
            repoRootFsPath: deps.repoRoot,
            changelistId,
            message,
          });

          const extra = res.skippedUntrackedCount
            ? ` (skipped ${res.skippedUntrackedCount} untracked)`
            : "";

          vscode.window.showInformationMessage(
            `Stashed ${res.stashedCount} file(s) from ${label}${extra}.`,
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
    vscode.commands.registerCommand(
      "gitWorklists.stash.apply",
      async (node: any) => {
        const ref = typeof node?.stash?.ref === "string" ? node.stash.ref : "";
        if (!ref) {
          return;
        }

        try {
          await deps.git.stashApply(deps.repoRoot, ref);
          deps.coordinator.trigger();
          deps.stashesProvider.refresh();
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
          await deps.git.stashPop(deps.repoRoot, ref);
          deps.coordinator.trigger();
          deps.stashesProvider.refresh();
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
          await deps.git.stashDrop(deps.repoRoot, ref);
          deps.coordinator.trigger();
          deps.stashesProvider.refresh();
          vscode.window.showInformationMessage(`Deleted ${ref}.`);
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),
  );
}
