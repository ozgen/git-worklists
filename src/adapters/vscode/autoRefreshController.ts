import * as path from "path";
import type { DisposableLike, UriLike, VscodeFacade } from "./vscodeFacade";

export class AutoRefreshController implements DisposableLike {
  private disposables: DisposableLike[] = [];

  constructor(
    private readonly vs: VscodeFacade,
    private readonly repoRoot: string,
    private readonly gitDir: string,
    private readonly onSignal: () => void,
  ) {}

  start(): void {
    this.watchGitFile("index");
    this.watchGitFile("HEAD");

    const isInRepo = (uri: UriLike) => {
      const fsPath = uri.fsPath;
      const rel = path.relative(this.repoRoot, fsPath);
      return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
    };

    this.disposables.push(
      this.vs.workspace.onDidCreateFiles((e) => {
        if (e.files.some(isInRepo)) {
          this.onSignal();
        }
      }),
      this.vs.workspace.onDidDeleteFiles((e) => {
        if (e.files.some(isInRepo)) {
          this.onSignal();
        }
      }),
      this.vs.workspace.onDidRenameFiles((e) => {
        if (e.files.some((f) => isInRepo(f.newUri) || isInRepo(f.oldUri))) {
          this.onSignal();
        }
      }),
      this.vs.workspace.onDidSaveTextDocument((d) => {
        if (isInRepo(d.uri)) {
          this.onSignal();
        }
      }),
    );
  }

  private watchGitFile(relativePath: string) {
    const pattern = new this.vs.RelativePattern(this.gitDir, relativePath);
    const w = this.vs.workspace.createFileSystemWatcher(pattern);

    this.disposables.push(
      w.onDidChange(() => this.onSignal()),
      w.onDidCreate(() => this.onSignal()),
      w.onDidDelete(() => this.onSignal()),
      w, // also dispose the watcher itself
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
