import * as vscode from "vscode";
import * as path from "path";

export class AutoRefreshController implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly repoRoot: string,
    private readonly gitDir: string,
    private readonly onSignal: () => void,
  ) {}

  start(): void {
    this.watchGitFile("index");
    this.watchGitFile("HEAD");

    const isInRepo = (uri: vscode.Uri) => {
      const fsPath = uri.fsPath;
      const rel = path.relative(this.repoRoot, fsPath);
      return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
    };

    this.disposables.push(
      vscode.workspace.onDidCreateFiles((e) => {
        if (e.files.some(isInRepo)) {
          this.onSignal();
        }
      }),
      vscode.workspace.onDidDeleteFiles((e) => {
        if (e.files.some(isInRepo)) {
          this.onSignal();
        }
      }),
      vscode.workspace.onDidRenameFiles((e) => {
        if (e.files.some((f) => isInRepo(f.newUri) || isInRepo(f.oldUri))) {
          this.onSignal();
        }
      }),
      vscode.workspace.onDidSaveTextDocument((d) => {
        if (isInRepo(d.uri)) {
          this.onSignal();
        }
      }),
    );
  }

  private watchGitFile(relativePath: string) {
    const pattern = new vscode.RelativePattern(this.gitDir, relativePath);
    const w = vscode.workspace.createFileSystemWatcher(pattern);
    w.onDidChange(() => this.onSignal());
    w.onDidCreate(() => this.onSignal());
    w.onDidDelete(() => this.onSignal());
    this.disposables.push(w);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
