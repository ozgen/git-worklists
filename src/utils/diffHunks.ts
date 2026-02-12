export function computeLineToDiffPosition(patch: string): {
  leftLineToPos: Map<number, number>;
  rightLineToPos: Map<number, number>;
} {
  const leftLineToPos = new Map<number, number>();
  const rightLineToPos = new Map<number, number>();

  let l = 0;
  let r = 0;
  let inHunk = false;

  // diff "position" is 1-based and counts lines inside the patch text
  let pos = 0;

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      pos++;
      const h = raw.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (h) {
        l = Number(h[1]);
        r = Number(h[2]);
        inHunk = true;
      }
      continue;
    }

    if (!inHunk) {
      continue;
    }

    pos++;

    if (!raw || raw.startsWith("\\ No newline")) {
      continue;
    }

    const ch = raw[0];
    if (ch === " ") {
      leftLineToPos.set(l, pos);
      rightLineToPos.set(r, pos);
      l++;
      r++;
      continue;
    }
    if (ch === "-") {
      leftLineToPos.set(l, pos);
      l++;
      continue;
    }
    if (ch === "+") {
      rightLineToPos.set(r, pos);
      r++;
      continue;
    }
  }

  return { leftLineToPos, rightLineToPos };
}
