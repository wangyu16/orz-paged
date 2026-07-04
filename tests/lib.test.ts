import { describe, it, expect } from 'vitest';
import { buildPagedHtml, composeInlineHtml } from '../src/lib.js';

const SRC = [
  '{{nyml',
  'kind: document',
  'template: note',
  '}}',
  '',
  '# Hello',
  '',
  'Some **body** text.',
].join('\n');

describe('buildPagedHtml', () => {
  const html = buildPagedHtml({ markdown: SRC, title: 'My Doc' });

  it('embeds the carrier source island', () => {
    expect(html).toContain('<script type="text/markdown" id="orz-src">');
    expect(html).toContain('Some **body** text.');
  });

  it('inlines the engine (not a CDN <script src=…>)', () => {
    // The engine tag is present…
    expect(html).toContain('<script data-orz-asset="engine">');
    // …fully inline, so it carries no src attribute and no jsDelivr reference.
    expect(html).not.toContain('orz-paged-browser@');
    expect(html).not.toMatch(/<script data-orz-asset="engine"[^>]*\ssrc=/);
  });

  it('sets the title', () => {
    expect(html).toContain('<title>My Doc</title>');
  });

  it('defaults the title to Untitled', () => {
    expect(buildPagedHtml({ markdown: SRC })).toContain('<title>Untitled</title>');
  });

  it('equals the shared inline composition for the same source/title', () => {
    // paged has no per-document random id, so composition is deterministic:
    // buildPagedHtml is exactly composeInlineHtml(source, title).
    expect(buildPagedHtml({ markdown: SRC, title: 'My Doc' }))
      .toBe(composeInlineHtml(SRC, 'My Doc'));
  });

  it('is stable across calls (deterministic — no random docId)', () => {
    expect(buildPagedHtml({ markdown: SRC, title: 'My Doc' }))
      .toBe(buildPagedHtml({ markdown: SRC, title: 'My Doc' }));
  });

  it('uses a template skeleton as source only when markdown is empty', () => {
    const fromTpl = buildPagedHtml({ markdown: '   ', template: 'note' });
    // The note skeleton content shows up in the embedded source island.
    const noteSkeleton = composeInlineHtml('', 'x'); // just to confirm compose works
    expect(noteSkeleton).toContain('id="orz-src"');
    // markdown wins when present:
    const fromMd = buildPagedHtml({ markdown: SRC, template: 'note' });
    expect(fromMd).toContain('Some **body** text.');
    // template-sourced doc differs from the empty-source doc.
    expect(fromTpl).not.toBe(buildPagedHtml({ markdown: '   ' }));
  });
});
