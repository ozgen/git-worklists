import { DiffTabTracker } from "../adapters/vscode/diffTabTracker";

export class CloseDiffTabs {
  constructor(private readonly tracker: DiffTabTracker) {}

  async run(): Promise<void> {
    await this.tracker.closeTrackedTabs();
  }
}
