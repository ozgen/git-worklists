import * as vscode from "vscode";

type RefreshFn = () => Promise<void>;

export class RefreshCoordinator implements vscode.Disposable {
  private pending = false;
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly refreshFn: RefreshFn,
    private readonly debounceMs: number = 200
  ) {}

  /** Debounced trigger (use for file watchers/events). */
  trigger(): void {
    this.pending = true;

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.debounceMs);
  }

  /** Immediate refresh request (still serialized). */
  requestNow(): Promise<void> {
    this.pending = true;
    return this.flush();
  }

  private async flush(): Promise<void> {
    if (this.running) return;
    if (!this.pending) return;

    this.running = true;
    try {
      while (this.pending) {
        this.pending = false;
        await this.refreshFn();
      }
    } finally {
      this.running = false;
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
