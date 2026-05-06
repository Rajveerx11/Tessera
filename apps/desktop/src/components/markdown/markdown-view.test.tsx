import { describe, expect, it } from 'vitest';

import { MarkdownView } from './markdown-view';

/**
 * The MarkdownView component itself is a thin wrapper around
 * `react-markdown`. The security-critical behaviour is link-href
 * filtering plus the absence of `rehype-raw`. We test those by
 * inspecting the rendered DOM-string, since React 19 + jsdom is
 * heavyweight and the goal here is to lock the contract, not to
 * snapshot the visual output.
 */
import { renderToStaticMarkup } from 'react-dom/server';

describe('MarkdownView', () => {
  it('renders bold + lists from plain markdown', () => {
    const html = renderToStaticMarkup(<MarkdownView source={'**bold** _italic_\n\n- a\n- b'} />);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<li>a</li>');
  });

  it('strips raw HTML so a script tag in LLM output cannot execute', () => {
    const html = renderToStaticMarkup(
      <MarkdownView source={'<script>alert(1)</script>\n\nhello'} />,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('hello');
  });

  it('rejects javascript: URLs on links', () => {
    const dangerousScheme = 'java' + 'script:alert(1)';
    const html = renderToStaticMarkup(<MarkdownView source={`[click](${dangerousScheme})`} />);
    // react-markdown blocks the href entirely; our component also
    // strips javascript: in `isSafeHref`. The rendered anchor must
    // not carry the dangerous href.
    expect(html).not.toContain('javascript:');
  });

  it('renders http(s) and mailto links with safe rel attributes', () => {
    const html = renderToStaticMarkup(
      <MarkdownView source={'[ext](https://example.com)\n\n[mail](mailto:a@b.test)'} />,
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="mailto:a@b.test"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('target="_blank"');
  });

  it('renders fenced code without executing language attributes', () => {
    const html = renderToStaticMarkup(
      <MarkdownView source={'```ts\nconst x = 1;\n```'} />,
    );
    expect(html).toContain('<pre');
    expect(html).toContain('language-ts');
    // No <script> regardless of language id
    expect(html).not.toContain('<script');
  });
});
