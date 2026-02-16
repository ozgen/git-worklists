import * as vscode from "vscode";

export type NewFileDecision = "add" | "keep" | "disable" | "dismiss";

export class VsCodePrompt {
  async confirmAddNewFiles(
    count: number,
    sample?: string,
  ): Promise<NewFileDecision> {
    const msg =
      count === 1
        ? `Add to Git?\n${sample ?? ""}`.trim()
        : `Add ${count} new files to Git?`;

    const answer = await vscode.window.showInformationMessage(
      msg,
      "Add",
      "Keep Unversioned",
      "Disable prompt",
    );

    if (answer === "Add") {
      return "add";
    }
    if (answer === "Keep Unversioned") {
      return "keep";
    }
    if (answer === "Disable prompt") {
      return "disable";
    }
    return "dismiss";
  }
}
