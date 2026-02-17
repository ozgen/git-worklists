import * as vscode from "vscode";

export class DiffTabTracker {
  private opened = new Set<string>();

  track(uri: vscode.Uri): void {
    this.opened.add(uri.toString());
  }

  clear(): void {
    this.opened.clear();
  }

  async closeTrackedTabs(): Promise<void> {
    if (this.opened.size === 0) {
      return;
    }

    const toClose: vscode.Tab[] = [];

    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input: any = tab.input;

        const modified: vscode.Uri | undefined = input?.modified;
        const original: vscode.Uri | undefined = input?.original;
        const uri: vscode.Uri | undefined = input?.uri;

        const matches =
          (modified && this.opened.has(modified.toString())) ||
          (original && this.opened.has(original.toString())) ||
          (uri && this.opened.has(uri.toString()));

        if (matches) {
          toClose.push(tab);
        }
      }
    }

    if (toClose.length > 0) {
      await vscode.window.tabGroups.close(toClose, true);
    }

    this.opened.clear();
  }
}
