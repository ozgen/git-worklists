import * as path from "path";
import type { DisposableLike, UriLike, VscodeFacade } from "./vscodeFacade";

export type RenamedRepoPair = { oldRelPath: string; newRelPath: string };

export class AutoRefreshController implements DisposableLike {
  private disposables: DisposableLike[] = [];

  constructor(
    private readonly vs: VscodeFacade,
    private readonly getRepoRoot: () => string,
    private readonly getGitDir: () => string,
    private readonly onSignal: () => void,
    private readonly onRename?: (pairs: RenamedRepoPair[]) => Promise<void>,
  ) {}

  start(): void {
    this.watchGitFile("index");
    this.watchGitFile("HEAD");

    const isInRepo = (uri: UriLike) => {
      const fsPath = uri.fsPath;
      const rel = path.relative(this.getRepoRoot(), fsPath);
      return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
    };

    const toRelPath = (uri: UriLike): string => {
      const rel = path.relative(this.getRepoRoot(), uri.fsPath);
      if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
        return "";
      }
      return rel.replace(/\\/g, "/");
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
        const relevant = e.files.filter(
          (f) => isInRepo(f.newUri) || isInRepo(f.oldUri),
        );
        if (relevant.length === 0) {
          return;
        }

        const pairs = relevant
          .map((f) => ({
            oldRelPath: toRelPath(f.oldUri),
            newRelPath: toRelPath(f.newUri),
          }))
          .filter(
            (p): p is RenamedRepoPair => !!p.oldRelPath && !!p.newRelPath,
          );

        const proceed = () => this.onSignal();
        if (this.onRename && pairs.length > 0) {
          this.onRename(pairs).catch(() => {}).then(proceed);
        } else {
          proceed();
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
    const pattern = new this.vs.RelativePattern(this.getGitDir(), relativePath);
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
