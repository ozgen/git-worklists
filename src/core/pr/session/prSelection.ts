export class PrSelection {
  private prNumber?: number;

  set(prNumber: number) {
    this.prNumber = prNumber;
  }

  get(): number | undefined {
    return this.prNumber;
  }

  clear() {
    this.prNumber = undefined;
  }
}
