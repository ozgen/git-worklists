import * as vscode from "vscode";

export function info(msg: string) {
  vscode.window.showInformationMessage(msg);
}
