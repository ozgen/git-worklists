import * as vscode from "vscode";
import { GitShowContentProvider } from "../adapters/vscode/gitShowContentProvider"; // adjust path
import { Deps } from "../app/types";
import { CreateStashForChangelist } from "../usecases/stash/createStashForChangelist";

function showUri(ref: string, repoRelPath: string): vscode.Uri {
  const p = repoRelPath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");

  return vscode.Uri.parse(
    `${GitShowContentProvider.scheme}:/${encodeURIComponent(ref)}/${p}`,
  );
}

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

          if (message === undefined) {
            return;
          }

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
        const changelistName =
          typeof node?.stash?.changelistId === "string"
            ? node.stash.changelistId
            : "";
        const stashLabel =
          typeof node?.stash?.message === "string" && node.stash.message
            ? node.stash.message
            : ref;
        if (!ref) {
          return;
        }

        try {
          const files = await deps.git.stashListFiles(deps.repoRoot, ref);
          await deps.git.stashApply(deps.repoRoot, ref);
          await deps.coordinator.requestNow();
          if (changelistName) {
            await deps.restoreFilesToChangelist.run(
              deps.repoRoot,
              changelistName,
              files.map((f) => f.path),
            );
            await deps.coordinator.requestNow();
          }
          deps.stashesProvider.refresh();
          vscode.window.showInformationMessage(`Applied "${stashLabel}".`);
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
        const changelistName =
          typeof node?.stash?.changelistId === "string"
            ? node.stash.changelistId
            : "";
        const stashLabel =
          typeof node?.stash?.message === "string" && node.stash.message
            ? node.stash.message
            : ref;
        if (!ref) {
          return;
        }

        try {
          const files = await deps.git.stashListFiles(deps.repoRoot, ref);
          await deps.git.stashPop(deps.repoRoot, ref);
          await deps.coordinator.requestNow();
          if (changelistName) {
            await deps.restoreFilesToChangelist.run(
              deps.repoRoot,
              changelistName,
              files.map((f) => f.path),
            );
            await deps.coordinator.requestNow();
          }
          deps.stashesProvider.refresh();
          vscode.window.showInformationMessage(`Popped "${stashLabel}".`);
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
        const stashLabel =
          typeof node?.stash?.message === "string" && node.stash.message
            ? node.stash.message
            : ref;
        if (!ref) {
          return;
        }

        const ok = await vscode.window.showWarningMessage(
          `Delete "${stashLabel}"?`,
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
          vscode.window.showInformationMessage(`Deleted "${stashLabel}".`);
        } catch (e: any) {
          console.error(e);
          vscode.window.showErrorMessage(String(e?.message ?? e));
        }
      },
    ),

    vscode.commands.registerCommand(
      "gitWorklists.stash.openFileDiff",
      async (node: any) => {
        const stashRef =
          typeof node?.stash?.ref === "string" ? node.stash.ref : "";
        const repoRelPath = typeof node?.path === "string" ? node.path : "";
        const status =
          typeof node?.status === "string" ? node.status : undefined;

        if (!stashRef || !repoRelPath) {
          return;
        }

        const right = showUri(stashRef, repoRelPath);

        if (status === "A") {
          const doc = await vscode.workspace.openTextDocument(right);
          await vscode.window.showTextDocument(doc, { preview: true });
          return;
        }

        // Default left = base commit of stash
        let leftRef = `${stashRef}^1`;

        if (status === "A") {
          leftRef = "EMPTY";
        }

        const left = showUri(leftRef, repoRelPath);
        const title = `${repoRelPath} (${stashRef})`;

        await vscode.commands.executeCommand("vscode.diff", left, right, title);
      },
    ),
  );
}
