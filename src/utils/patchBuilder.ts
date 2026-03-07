/**
 * Given the full output of `git diff -- <file>` and a 1-based line range in
 * the working tree (right/new side), returns a patch that stages only the
 * change blocks whose new-side lines overlap [selectedStart, selectedEnd].
 *
 * Granularity: change-block level. A "change block" is a run of consecutive
 * `-`/`+` lines with no context lines between them. A block is staged if any
 * of its `+` lines falls within the selection. Pure-deletion blocks (no `+`
 * lines) cannot be selected in the diff editor's right pane and are skipped.
 *
 * Unselected blocks are neutralized: `-old` lines become ` old` (keep old
 * content in index) and `+new` lines are dropped. Hunk header counts are
 * recalculated to reflect the modified body.
 *
 * Returns null when the diff is empty or the selection contains no stageable
 * changes.
 */
export function buildPatchForLineRange(
  fullDiff: string,
  selectedStart: number,
  selectedEnd: number,
): string | null {
  if (!fullDiff.trim()) {
    return null;
  }

  const lines = fullDiff.split("\n");

  const headerLines: string[] = [];
  let i = 0;
  while (i < lines.length && !lines[i].startsWith("@@")) {
    headerLines.push(lines[i]);
    i++;
  }

  const patchHunks: string[] = [];

  while (i < lines.length) {
    if (lines[i].startsWith("diff ")) {
      break;
    }

    if (!lines[i].startsWith("@@")) {
      i++;
      continue;
    }

    const hunkHeader = lines[i];
    const m = hunkHeader.match(
      /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/,
    );

    i++;
    const bodyLines: string[] = [];
    while (
      i < lines.length &&
      !lines[i].startsWith("@@") &&
      !lines[i].startsWith("diff ")
    ) {
      bodyLines.push(lines[i]);
      i++;
    }

    if (!m) {
      continue;
    }

    const oldStart = parseInt(m[1], 10);
    const newStart = parseInt(m[3], 10);
    const suffix = m[5] ?? "";

    const trimmed = trimHunkToSelection(
      bodyLines,
      oldStart,
      newStart,
      selectedStart,
      selectedEnd,
    );

    if (!trimmed) {
      continue;
    }

    const { newBody, oldCount, newCount, oldStartOut, newStartOut } = trimmed;
    const newHeader = `@@ -${oldStartOut},${oldCount} +${newStartOut},${newCount} @@${suffix}`;
    patchHunks.push([newHeader, ...newBody].join("\n"));
  }

  if (patchHunks.length === 0) {
    return null;
  }

  return headerLines.join("\n") + "\n" + patchHunks.join("\n");
}

type TrimResult = {
  newBody: string[];
  oldCount: number;
  newCount: number;
  oldStartOut: number;
  newStartOut: number;
};

function trimHunkToSelection(
  bodyLines: string[],
  oldStart: number,
  newStart: number,
  selStart: number,
  selEnd: number,
): TrimResult | null {
  const result: string[] = [];

  let oldLine = oldStart;
  let newLine = newStart;
  let hasChanges = false;

  let firstOldLineUsed: number | null = null;
  let firstNewLineUsed: number | null = null;

  const markFirstUsed = (
    oldCandidate: number | null,
    newCandidate: number | null,
  ) => {
    if (firstOldLineUsed === null && oldCandidate !== null) {
      firstOldLineUsed = oldCandidate;
    }
    if (firstNewLineUsed === null && newCandidate !== null) {
      firstNewLineUsed = newCandidate;
    }
  };

  let i = 0;
  while (i < bodyLines.length) {
    const line = bodyLines[i];
    const prefix = line[0];

    if (prefix === " ") {
      result.push(line);
      markFirstUsed(oldLine, newLine);
      oldLine++;
      newLine++;
      i++;
      continue;
    }

    if (prefix !== "-" && prefix !== "+") {
      result.push(line);
      i++;
      continue;
    }

    const blockLines: string[] = [];
    const plusLineNumbers: number[] = [];
    const blockOldStart = oldLine;
    const blockNewStart = newLine;

    while (
      i < bodyLines.length &&
      (bodyLines[i][0] === "-" || bodyLines[i][0] === "+")
    ) {
      const blockLine = bodyLines[i];
      blockLines.push(blockLine);

      if (blockLine[0] === "-") {
        oldLine++;
      } else if (blockLine[0] === "+") {
        plusLineNumbers.push(newLine);
        newLine++;
      }

      i++;
    }

    const overlapsSelection = plusLineNumbers.some(
      (lineNo) => lineNo >= selStart && lineNo <= selEnd,
    );

    if (overlapsSelection) {
      for (const bl of blockLines) {
        result.push(bl);
      }
      markFirstUsed(blockOldStart, blockNewStart);
      hasChanges = true;
    } else {
      for (const bl of blockLines) {
        if (bl[0] === "-") {
          result.push(" " + bl.slice(1));
          markFirstUsed(blockOldStart, blockNewStart);
        }
      }
    }
  }

  if (!hasChanges) {
    return null;
  }

  let oldCount = 0;
  let newCount = 0;
  for (const line of result) {
    if (line[0] === " " || line[0] === "-") {
      oldCount++;
    }
    if (line[0] === " " || line[0] === "+") {
      newCount++;
    }
  }

  return {
    newBody: result,
    oldCount,
    newCount,
    oldStartOut: firstOldLineUsed ?? oldStart,
    newStartOut: firstNewLineUsed ?? newStart,
  };
}
