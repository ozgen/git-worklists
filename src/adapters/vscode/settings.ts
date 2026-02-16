import * as vscode from "vscode";

export class VsCodeSettings {
  getPromptOnNewFile(): boolean {
    return vscode.workspace
      .getConfiguration("gitWorklists")
      .get<boolean>("promptOnNewFile", true);
  }

  async setPromptOnNewFile(enabled: boolean): Promise<void> {
    await vscode.workspace
      .getConfiguration("gitWorklists")
      .update("promptOnNewFile", enabled, vscode.ConfigurationTarget.Global);
  }
}
