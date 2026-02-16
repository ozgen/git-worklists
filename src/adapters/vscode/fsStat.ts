import * as vscode from "vscode";

export class VsCodeFsStat {
  async filterOnlyFiles(uris: readonly vscode.Uri[]): Promise<vscode.Uri[]> {
    const out: vscode.Uri[] = [];
    for (const uri of uris) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        const isFile =
          (stat.type & vscode.FileType.File) === vscode.FileType.File;
        if (isFile) {
          out.push(uri);
        }
      } catch {
        // ignore
      }
    }
    return out;
  }
}
