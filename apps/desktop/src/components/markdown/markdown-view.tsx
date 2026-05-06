import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * XSS-safe markdown viewer.
 *
 * Security model:
 * - `react-markdown`'s default behaviour is to ignore raw HTML. We
 *   deliberately do NOT add `rehype-raw` — LLM output is untrusted and
 *   raw `<script>` / `<iframe>` / `onclick=` payloads must not reach
 *   the DOM.
 * - `remark-gfm` adds tables / strikethrough / task lists (Markdown
 *   features the prompts emit) without enabling raw HTML.
 * - Link rendering is overridden so anchors open in a new browsing
 *   context (`target="_blank"`) with `rel="noreferrer noopener"` to
 *   avoid `window.opener` leaks. We also strip `javascript:` URLs.
 * - Code blocks render to a plain `<pre><code>` — no syntax
 *   highlighting plugin (would re-introduce a parser surface and
 *   doesn't render anything user-controlled as HTML).
 */
export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {source}
      </ReactMarkdown>
    </div>
  );
}

const MARKDOWN_COMPONENTS: Components = {
  a({ href, children, ...rest }) {
    const safe = isSafeHref(href);
    return (
      <a
        {...rest}
        href={safe ? href : undefined}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  code({ className, children }) {
    const isBlock = typeof className === 'string' && className.startsWith('language-');
    if (isBlock) {
      return (
        <pre className="bg-muted text-foreground overflow-x-auto rounded-md border border-border p-3 text-xs">
          <code className={className}>{children}</code>
        </pre>
      );
    }
    return <code className="bg-muted text-foreground rounded px-1 py-0.5 text-xs">{children}</code>;
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border-border bg-muted/40 border px-2 py-1 text-left font-semibold">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border-border border px-2 py-1 align-top">{children}</td>;
  },
};

/**
 * Allow only `http(s)` and `mailto:` schemes. `react-markdown` already
 * filters `javascript:`, but we belt-and-brace the check so a future
 * upstream relaxation does not regress us.
 */
function isSafeHref(href: string | undefined): boolean {
  if (typeof href !== 'string' || href.length === 0) return false;
  const lower = href.trim().toLowerCase();
  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('#') ||
    lower.startsWith('/')
  );
}
