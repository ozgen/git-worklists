import * as vscode from "vscode";
import { GitCliClient } from "./adapters/git/GitCliClient";
import { WorkspaceStateStore } from "./adapters/storage/WorkspaceStateStore";
import { InitializeWorkspace } from "./usecases/InitializeWorkspace";

export async function activate(context: vscode.ExtensionContext) {
  console.log("git-worklists extension activated");

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    console.log("No workspace folder open; skipping init");
    return;
  }

  const git = new GitCliClient();
  const store = new WorkspaceStateStore(context.workspaceState);
  const init = new InitializeWorkspace(git, store);

  try {
    await init.run(workspaceFolder.uri.fsPath);
    console.log("Initialized git-worklists state");
  } catch (err) {
    console.error("Failed to initialize git-worklists:", err);
  }
}

export function deactivate() {}
