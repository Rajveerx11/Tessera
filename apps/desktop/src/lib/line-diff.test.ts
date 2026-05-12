import { describe, expect, it } from 'vitest';

import { diffStats, lineDiff } from './line-diff';

describe('lineDiff', () => {
  it('returns empty when both inputs are empty', () => {
    expect(lineDiff('', '')).toEqual([]);
  });

  it('marks every line as added when before is empty', () => {
    const diff = lineDiff('', 'a\nb');
    expect(diff.map((d) => d.kind)).toEqual(['add', 'add']);
    expect(diff.map((d) => d.afterLine)).toEqual([1, 2]);
    expect(diff.map((d) => d.beforeLine)).toEqual([null, null]);
  });

  it('marks every line as removed when after is empty', () => {
    const diff = lineDiff('a\nb', '');
    expect(diff.map((d) => d.kind)).toEqual(['del', 'del']);
    expect(diff.map((d) => d.beforeLine)).toEqual([1, 2]);
  });

  it('detects a single-line replacement', () => {
    const diff = lineDiff('one\ntwo\nthree', 'one\nTWO\nthree');
    expect(diff.map((d) => d.kind)).toEqual(['eq', 'del', 'add', 'eq']);
    expect(diff[1]?.value).toBe('two');
    expect(diff[2]?.value).toBe('TWO');
  });

  it('keeps stable line numbers on partially shared input', () => {
    const diff = lineDiff('a\nb\nc', 'a\nx\ny\nc');
    expect(diff).toEqual([
      { kind: 'eq', value: 'a', beforeLine: 1, afterLine: 1 },
      { kind: 'del', value: 'b', beforeLine: 2, afterLine: null },
      { kind: 'add', value: 'x', beforeLine: null, afterLine: 2 },
      { kind: 'add', value: 'y', beforeLine: null, afterLine: 3 },
      { kind: 'eq', value: 'c', beforeLine: 3, afterLine: 4 },
    ]);
  });

  it('returns identity when inputs are equal', () => {
    const diff = lineDiff('a\nb\nc', 'a\nb\nc');
    expect(diff.map((d) => d.kind)).toEqual(['eq', 'eq', 'eq']);
  });
});

describe('diffStats', () => {
  it('counts each kind', () => {
    const stats = diffStats(lineDiff('a\nb\nc', 'a\nx\ny\nc'));
    expect(stats).toEqual({ added: 2, removed: 1, unchanged: 2 });
  });

  it('returns zeros for an empty diff', () => {
    expect(diffStats([])).toEqual({ added: 0, removed: 0, unchanged: 0 });
  });
});
