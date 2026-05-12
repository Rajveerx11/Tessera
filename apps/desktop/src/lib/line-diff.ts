/**
 * Line-level diff via longest-common-subsequence.
 *
 * Pulled in-house rather than adding the `diff` npm package — the
 * desktop's artifact bodies are short Markdown (~100–500 lines in
 * practice) so the O(n*m) DP table is sub-millisecond, and avoiding
 * the dep keeps the workspace lockfile stable.
 *
 * The output is the minimal sequence of `eq` / `del` / `add` chunks
 * that transforms `before` into `after`. Identical lines collapse
 * into a single `eq` chunk so the renderer can fold long runs of
 * unchanged context behind an "expand" affordance later.
 *
 * Trailing newlines are preserved per line — input is `split('\n')`,
 * so each chunk's `value` is one full source line minus the newline.
 */

export type DiffLineKind = 'eq' | 'del' | 'add';

export type DiffLine = {
  kind: DiffLineKind;
  /** Single source line (newline-stripped). */
  value: string;
  /** 1-indexed line number in the `before` text, when kind ≠ 'add'. */
  beforeLine: number | null;
  /** 1-indexed line number in the `after` text, when kind ≠ 'del'. */
  afterLine: number | null;
};

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.length === 0 ? [] : before.split('\n');
  const b = after.length === 0 ? [] : after.split('\n');

  // Build LCS length table — dp[i][j] = length of LCS of a[..i] and
  // b[..j]. Allocate a single flat typed array for cache locality.
  // `Uint32Array` is fully populated up front by the constructor so
  // every cell read below is a real `number` — the TS strict
  // `noUncheckedIndexedAccess` flag still widens to `number |
  // undefined`, so we read through `cellAt` which narrows back.
  const cols = b.length + 1;
  const dp = new Uint32Array((a.length + 1) * cols);
  const cellAt = (i: number, j: number): number => dp[i * cols + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        dp[i * cols + j] = cellAt(i + 1, j + 1) + 1;
      } else {
        const down = cellAt(i + 1, j);
        const right = cellAt(i, j + 1);
        dp[i * cols + j] = down > right ? down : right;
      }
    }
  }

  // Walk the table to emit chunks in source order.
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'eq', value: a[i] ?? '', beforeLine: i + 1, afterLine: j + 1 });
      i += 1;
      j += 1;
    } else if (cellAt(i + 1, j) >= cellAt(i, j + 1)) {
      out.push({ kind: 'del', value: a[i] ?? '', beforeLine: i + 1, afterLine: null });
      i += 1;
    } else {
      out.push({ kind: 'add', value: b[j] ?? '', beforeLine: null, afterLine: j + 1 });
      j += 1;
    }
  }
  while (i < a.length) {
    out.push({ kind: 'del', value: a[i] ?? '', beforeLine: i + 1, afterLine: null });
    i += 1;
  }
  while (j < b.length) {
    out.push({ kind: 'add', value: b[j] ?? '', beforeLine: null, afterLine: j + 1 });
    j += 1;
  }
  return out;
}

/**
 * Aggregate stats for a diff (added / removed / kept). Useful for
 * the "+X / -Y" badge the drawer header shows next to the diff
 * toggle so the user knows the shape of a change before scrolling.
 */
export function diffStats(diff: ReadonlyArray<DiffLine>): {
  added: number;
  removed: number;
  unchanged: number;
} {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const line of diff) {
    if (line.kind === 'add') added += 1;
    else if (line.kind === 'del') removed += 1;
    else unchanged += 1;
  }
  return { added, removed, unchanged };
}
