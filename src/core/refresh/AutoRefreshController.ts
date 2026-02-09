import * as vscode from "vscode";

export class AutoRefreshController implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly repoRoot: string,
    private readonly gitDir: string,
    private readonly onSignal: () => void,
  ) {}

  start(): void {
    // Watch git index + HEAD (most meaningful signals)
    this.watchGitFile("index");
    this.watchGitFile("HEAD");

    // Optional: watch refs (covers some flows, can be noisy)
    // this.watchGitGlob("refs/**");

    // Workspace changes that often impact status views
    this.disposables.push(
      vscode.workspace.onDidCreateFiles(() => this.onSignal()),
      vscode.workspace.onDidDeleteFiles(() => this.onSignal()),
      vscode.workspace.onDidRenameFiles(() => this.onSignal()),
      vscode.workspace.onDidSaveTextDocument(() => this.onSignal()),
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

  private watchGitGlob(glob: string) {
    const pattern = new vscode.RelativePattern(this.gitDir, glob);
    const w = vscode.workspace.createFileSystemWatcher(pattern);
    w.onDidChange(() => this.onSignal());
    w.onDidCreate(() => this.onSignal());
    w.onDidDelete(() => this.onSignal());
    this.disposables.push(w);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
