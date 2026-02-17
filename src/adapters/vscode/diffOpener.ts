import * as vscode from "vscode";
import * as path from "path";

export class VsCodeDiffOpener {
    private languageFallbackFromExt(fsPath: string): string | undefined {
        const ext = path.extname(fsPath).toLowerCase();
        const map: Record<string, string> = {
          ".ts": "typescript",
          ".tsx": "typescriptreact",
          ".js": "javascript",
          ".jsx": "javascriptreact",
          ".json": "json",
          ".md": "markdown",
          ".yml": "yaml",
          ".yaml": "yaml",
          ".toml": "toml",
          ".rs": "rust",
          ".py": "python",
          ".go": "go",
          ".java": "java",
          ".c": "c",
          ".h": "c",
          ".cpp": "cpp",
          ".hpp": "cpp",
        };
        return map[ext];
      }      

  async openContentVsFileDiff(opts: {
    title: string;
    leftContent: string;
    leftLabelPath: string; 
    rightUri: vscode.Uri;
  }): Promise<void> {
    const leftDoc = await vscode.workspace.openTextDocument({
      content: opts.leftContent,
      language: this.languageFallbackFromExt(opts.leftLabelPath),
    });

    await vscode.commands.executeCommand(
      "vscode.diff",
      leftDoc.uri,
      opts.rightUri,
      opts.title,
    );
  }
}
