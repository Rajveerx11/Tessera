import type { CreatedIssue, ExternalLink, PushPreview } from '@testing-ide/shared';
import { Loader2, X, Check, ArrowUpRight, AlertCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useDialogTitleId } from '@/lib/dialog-title';
import { trackers, getErrorMessage } from '@/lib/ipc';

type Props = {
  artifactId: string;
  onClose: () => void;
};

export function JiraPushDialog({ artifactId, onClose }: Props) {
  const titleId = useDialogTitleId();

  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PushPreview | null>(null);
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<CreatedIssue | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [p, l] = await Promise.all([
          trackers.previewJiraPush(artifactId),
          trackers.listExternalLinks(artifactId),
        ]);
        setPreview(p);
        setLinks(l);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [artifactId]);

  const handlePush = useCallback(() => {
    setPushing(true);
    setError(null);
    void (async () => {
      try {
        const res = await trackers.pushArtifactToJira(artifactId);
        setResult(res);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setPushing(false);
      }
    })();
  }, [artifactId]);

  return (
    <Dialog open onClose={onClose} labelledBy={titleId} widthClass="max-w-lg">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <h2 id={titleId} className="flex items-center gap-2">
          <span className="font-brand text-primary text-sm">tessera</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
            Jira Push Preview
          </span>
        </h2>
        <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs gap-2">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span>Generating Jira issue preview…</span>
          </div>
        ) : error ? (
          <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-xs flex items-start gap-2">
            <AlertCircle className="size-4 mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
          </div>
        ) : preview ? (
          <>
            {preview.alreadyLinked && (
              <div className="border-warning/30 bg-warning/5 text-warning rounded-md border p-3 text-xs flex flex-col gap-2">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="size-4" />
                  <span>This artifact is already linked to Jira issue(s).</span>
                </div>
                {links.length > 0 && (
                  <ul className="space-y-1 pl-6 list-disc">
                    {links.map((link) => (
                      <li key={link.id}>
                        <a
                          href={link.issueUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="underline font-mono inline-flex items-center gap-0.5"
                        >
                          {link.issueKey}
                          <ArrowUpRight className="size-3" />
                        </a>
                        {link.lastStatus && (
                          <span className="ml-1 text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.2 rounded font-mono">
                            {link.lastStatus}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {result ? (
              <div className="border-success/30 bg-success/5 text-success rounded-md border p-3 text-xs flex flex-col gap-2">
                <div className="flex items-center gap-2 font-medium">
                  <Check className="size-4" />
                  <span>Successfully pushed to Jira!</span>
                </div>
                <p>
                  Created issue:{' '}
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline font-mono inline-flex items-center gap-0.5"
                  >
                    {result.key}
                    <ArrowUpRight className="size-3" />
                  </a>
                </p>
              </div>
            ) : (
              <div className="border border-border rounded-md bg-background overflow-hidden">
                <div className="bg-muted px-3 py-2 border-b border-border flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <span>Project: <strong className="text-foreground">{preview.projectKey}</strong></span>
                  <span>Issue Type: <strong className="text-foreground">{preview.issueType}</strong></span>
                  {preview.priority && (
                    <span>Priority: <strong className="text-foreground">{preview.priority}</strong></span>
                  )}
                </div>

                <div className="p-3 space-y-3">
                  <div>
                    <h4 className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-1">
                      Summary
                    </h4>
                    <p className="text-xs font-semibold text-foreground font-mono">
                      {preview.summary}
                    </p>
                  </div>

                  {preview.labels.length > 0 && (
                    <div>
                      <h4 className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-1">
                        Labels
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {preview.labels.map((l) => (
                          <span
                            key={l}
                            className="bg-primary/5 text-primary border border-primary/20 text-[9px] px-1.5 py-0.5 rounded font-mono"
                          >
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-1">
                      Description Preview (Markdown)
                    </h4>
                    <div className="border border-border/60 bg-muted/30 p-2.5 rounded text-[11px] font-mono text-muted-foreground max-h-60 overflow-y-auto whitespace-pre-wrap">
                      {preview.description}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      <footer className="border-t border-border bg-surface-3 p-3 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        {!result && (
          <Button
            type="button"
            size="sm"
            onClick={handlePush}
            disabled={pushing || loading || preview === null}
          >
            {pushing ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                Pushing…
              </>
            ) : (
              'Confirm Push'
            )}
          </Button>
        )}
      </footer>
    </Dialog>
  );
}
