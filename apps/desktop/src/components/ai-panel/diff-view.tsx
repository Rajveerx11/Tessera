import { useMemo } from 'react';

import { diffStats, lineDiff, type DiffLine } from '@/lib/line-diff';

type Props = {
  before: string;
  after: string;
  /** Display labels for the two sides (e.g. "v3", "v4"). */
  beforeLabel: string;
  afterLabel: string;
};

/**
 * Unified line-level diff renderer.
 *
 * Plain-text view rather than a real markdown render — diffing
 * rendered markdown either has to compare DOM trees (heavy) or
 * compare against the renderer's whitespace + attribute output
 * (noisy). The artifact body is always Markdown source already,
 * which the user authored the regenerate feedback against, so
 * line-level source-text diff is what they want to see.
 */
export function DiffView({ before, after, beforeLabel, afterLabel }: Props) {
  const diff = useMemo(() => lineDiff(before, after), [before, after]);
  const stats = useMemo(() => diffStats(diff), [diff]);

  return (
    <div className="flex flex-col gap-2">
      <header className="text-muted-foreground flex items-center justify-between border-b border-border pb-2 text-[11px] font-mono">
        <span>
          <span className="text-destructive">−{stats.removed}</span>{' '}
          <span className="text-muted-foreground">/</span>{' '}
          <span className="text-success">+{stats.added}</span>{' '}
          <span className="text-muted-foreground">unchanged {stats.unchanged}</span>
        </span>
        <span className="truncate">
          <span className="text-destructive">{beforeLabel}</span>{' '}
          <span className="text-muted-foreground">→</span>{' '}
          <span className="text-success">{afterLabel}</span>
        </span>
      </header>
      {diff.length === 0 ? (
        <p className="text-muted-foreground text-xs">No textual difference.</p>
      ) : (
        <pre className="bg-surface-2 border-border overflow-x-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed">
          {diff.map((line, idx) => (
            <DiffLineRow key={idx} line={line} />
          ))}
        </pre>
      )}
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const prefix = line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' ';
  const klass =
    line.kind === 'add'
      ? 'bg-success/10 text-success'
      : line.kind === 'del'
        ? 'bg-destructive/10 text-destructive'
        : 'text-muted-foreground';
  return (
    <div className={`flex items-start gap-2 ${klass}`}>
      <span
        aria-hidden="true"
        className="text-muted-foreground/60 w-7 shrink-0 select-none text-right font-mono text-[10px]"
      >
        {line.beforeLine ?? '·'}
      </span>
      <span
        aria-hidden="true"
        className="text-muted-foreground/60 w-7 shrink-0 select-none text-right font-mono text-[10px]"
      >
        {line.afterLine ?? '·'}
      </span>
      <span aria-hidden="true" className="w-3 shrink-0 select-none">
        {prefix}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-all">{line.value || ' '}</span>
    </div>
  );
}
