import { describe, it, expect } from 'vitest';
import { assemble } from '../src/render-paged.js';
import { scanNymlBlocks } from '../src/doc/nyml.js';

/* ─────────────────────────── scanNymlBlocks ─────────────────────────── */

describe('scanNymlBlocks', () => {
  it('finds every block with its kind, fields, and char offsets', () => {
    const source = [
      'intro text',
      '',
      '{{nyml',
      'kind: document',
      'template: article',
      'page_size: A4',
      '}}',
      '',
      '{{nyml',
      'kind: article-title',
      'title: Hello',
      '}}',
      '',
      'body',
    ].join('\n');

    const blocks = scanNymlBlocks(source);
    expect(blocks).toHaveLength(2);

    const [doc, el] = blocks;
    expect(doc.kind).toBe('document');
    expect(doc.fields.template).toBe('article');
    expect(doc.fields.page_size).toBe('A4');
    expect(el.kind).toBe('article-title');
    expect(el.fields.title).toBe('Hello');

    // Offsets actually delimit the blocks in the source.
    expect(source.slice(doc.start, doc.end)).toMatch(/^\{\{nyml/);
    expect(source.slice(doc.start, doc.end)).toMatch(/\}\}$/);
    expect(source.slice(el.start, el.end)).toContain('title: Hello');
    expect(doc.end).toBeLessThanOrEqual(el.start);
  });

  it('parses a `|` multiline field (dedented, newline-joined)', () => {
    const source = [
      '{{nyml',
      'kind: abstract',
      'text: |',
      '  first line',
      '  second line',
      '}}',
    ].join('\n');

    const [block] = scanNymlBlocks(source);
    expect(block.kind).toBe('abstract');
    expect(block.fields.text).toBe('first line\nsecond line');
  });
});

/* ─────────────────────────── assemble ─────────────────────────── */

const SOURCE = [
  '{{nyml',
  'kind: document',
  'template: article',
  'page_size: A4',
  '}}',
  '',
  '{{nyml',
  'kind: article-title',
  'title: My Paper',
  'author: Ada Lovelace',
  '}}',
  '',
  '# Section One',
  '',
  'Some **body** text.',
].join('\n');

describe('assemble', () => {
  const out = assemble(SOURCE);

  it('reflects the merged settings (template + user overrides)', () => {
    // template: article sets LAYOUT only — no font; the theme owns that, and the
    // default theme (light-academic-1) applies when the source doesn't pick one.
    expect(out.settings.template).toBe('article');
    expect(out.settings.fontPreset).toBeUndefined();
    expect(out.settings.theme).toBe('light-academic-1');
    // user override beats the template default (A4 vs the template's Letter).
    expect(out.settings.pageSize).toBe('A4');
  });

  it('builds page CSS with @page and size', () => {
    expect(out.css).toContain('@page');
    expect(out.css).toContain('size: A4');
  });

  it('wraps content in .orz-doc.markdown-body', () => {
    expect(out.bodyHtml).toContain('<main class="orz-doc markdown-body">');
    expect(out.bodyHtml.trim().endsWith('</main>')).toBe(true);
  });

  it('renders the element HTML (not the raw nyml block)', () => {
    expect(out.bodyHtml).toContain('orz-el-article-title');
    expect(out.bodyHtml).toContain('My Paper');
    expect(out.bodyHtml).toContain('Ada Lovelace');
    // No leftover nyml or placeholder tokens.
    expect(out.bodyHtml).not.toContain('{{nyml');
    expect(out.bodyHtml).not.toContain('ORZEL-');
    // Element scoped CSS is present in the composed stylesheet.
    expect(out.css).toContain('.orz-el-article-title');
  });

  it('renders the regular Markdown body', () => {
    expect(out.bodyHtml).toContain('Section One');
    expect(out.bodyHtml).toContain('<strong>body</strong>');
  });

  it('does not leak the document block text into the body', () => {
    expect(out.bodyHtml).not.toContain('kind: document');
    expect(out.bodyHtml).not.toContain('template: article');
  });

  it('exposes the theme and a fontCssUrls array', () => {
    expect(out.theme).toBe('light-academic-1');
    expect(Array.isArray(out.fontCssUrls)).toBe(true);
    // system-serif has an empty cssUrl, so no font links for this doc.
    expect(out.fontCssUrls).not.toContain('');
  });
});
