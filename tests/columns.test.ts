/**
 * The two-column handler (claims C.1, C.2; REBUILD §3b decision 1, D-48: the
 * hybrid) — the prototype's 8-document regression (/tmp/cols-proto run.mjs,
 * ported) through the real engine: each document is assembled with the real
 * bundle, opened over http in real Chrome, and its read view's pages checked:
 * per-column text (every column's words, in order, across all its pages),
 * columns side by side, no blank pages, nothing clipped at a page bottom
 * except the documented over-tall item, no page errors.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../src/assemble.js';
import { MAX_CUTS } from '../src/paged/cols-flow.js';
import { bundle, launch, pagesIdle, routeCdn, serve, tempDir, type Browser } from './browser-env.js';

const FIX = 'tests/fixtures/columns';
const DOCS = readdirSync(FIX).filter((f) => f.endsWith('.md')).sort().map((f) => f.slice(0, -3));

describe('the handler (Node)', () => {
  it('[C.2] the hybrid handler is the prototype\'s, ported: registered by the paged runtime, hybrid only (no mode switch), the page area\'s column-width auto while measuring, a runaway guard, the over-tall first block forced', () => {
    const src = readFileSync('src/paged/cols-flow.ts', 'utf8');
    const runtime = readFileSync('src/paged/runtime.ts', 'utf8');
    expect(runtime).toContain('registerHandlers(ColsFlowHandler)');
    expect(src).not.toMatch(/__COLS_MODE__|mode\(\)|__COLS_DEBUG__/);
    expect(src).toMatch(/area\.style\.columnWidth = 'auto';[\s\S]*finally \{\s*area\.style\.columnWidth = prev;/);
    expect(src).toContain('if (this.stats.split + this.stats.moved > MAX_CUTS) return;');
    expect(MAX_CUTS).toBe(2000);
    expect(src).toMatch(/if \(r\.rest && r\.nothingFit && atTop\)/);
    expect(src).toMatch(/if \(!atTop && box\.height <= areaRect\.height - SAFETY\)/); // a short block moves whole
    expect(DOCS).toEqual(['a_long', 'b_unequal', 'c_short_bottom', 'd_three_custom', 'e_section', 'f_exam', 'g_edge', 'h_overtall']);
  });
});

const browser: Browser | null = await launch();
const files = tempDir('orz-paged-cols-');
const site = await serve(files.dir);
afterAll(async () => { await browser?.close(); await site.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;

interface Check {
  pages: number;
  cols: { fits: number; split: number; moved: number; fallback: number };
  integrity: string[];
  blank: number[];
  clipped: string[];
  merged: string[];
}

chrome('the 8-document regression (real Chrome)', () => {
  it('[C.1] per-column text in order, columns side by side, no blank pages, no clipping (but the documented over-tall item), short blocks moved whole, long ones split; no page errors', async () => {
    const b = await bundle();
    files.write('fig.svg', readFileSync(join(FIX, 'fig.svg'), 'utf8'));
    const ctx = await browser!.newContext({ viewport: { width: 1100, height: 1200 } });
    await routeCdn(ctx);
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const results: Record<string, Check> = {};
    for (const doc of DOCS) {
      const text = readFileSync(join(FIX, `${doc}.md`), 'utf8');
      files.write(`${doc}.paged.html`, assemble(text, { engineSource: b.iife }));
      await page.goto(`${site.url}/${doc}.paged.html`);
      await page.waitForFunction(() => !!(globalThis as { OrzCarrier?: { standalone?: unknown } }).OrzCarrier?.standalone);
      await pagesIdle(page);
      results[doc] = await page.evaluate(async (text) => {
        type C = { renderPreview(t: string): Promise<string>; standalone: { view: { lastResult(): { pages: number; cols: Check['cols'] } } } };
        const C = (globalThis as unknown as { OrzCarrier: C }).OrzCarrier;
        const words = (el: Element): string[] => (el.textContent || '').split(/\s+/).filter(Boolean);
        // the source: the content as rendered (versions applied), its top-level .cols blocks and MC option grids
        const t = document.createElement('template');
        t.innerHTML = await C.renderPreview(text);
        const top = (root: ParentNode): Element[] => Array.from(root.querySelectorAll('.cols')).filter((c) => !c.parentElement!.closest('.cols'));
        const srcBlocks = top(t.content).map((c) => Array.from(c.children).map((k) => words(k).join('')));
        const srcMc = Array.from(t.content.querySelectorAll('.orz-options')).map((o) => words(o).join(''));
        // the pages: the blocks in order (a continuation, data-cols-cont, adds to the block before it)
        const area = document.getElementById('orz-pages')!;
        const outBlocks: string[][] = [];
        for (const c of top(area)) {
          const cells = Array.from(c.children).map((k) => words(k).join(''));
          if (c.hasAttribute('data-cols-cont') && outBlocks.length) {
            const last = outBlocks[outBlocks.length - 1];
            cells.forEach((w, i) => { last[i] = (last[i] ?? '') + w; });
          } else outBlocks.push(cells);
        }
        const outMc = Array.from(area.querySelectorAll('.orz-options')).map((o) => words(o).join(''));
        const integrity: string[] = [];
        if (outBlocks.length !== srcBlocks.length) integrity.push(`blocks: source ${srcBlocks.length}, pages ${outBlocks.length}`);
        srcBlocks.forEach((cols, b) => cols.forEach((a, i) => {
          const z = outBlocks[b]?.[i] ?? '';
          if (a !== z) {
            let k = 0;
            while (k < a.length && a[k] === z[k]) k++;
            integrity.push(`block ${b} column ${i + 1}: source ${a.length} chars, pages ${z.length}, first difference at ${k}: "${a.slice(k, k + 24)}" vs "${z.slice(k, k + 24)}"`);
          }
        }));
        // every option grid whole (in the columns their page order interleaves the two columns: compared as sets)
        if ([...srcMc].sort().join('|') !== [...outMc].sort().join('|')) integrity.push(`the option grids differ: ${srcMc.length} in the source, ${outMc.length} on the pages`);
        // the layout checks of the prototype's run.mjs
        const pages = Array.from(area.querySelectorAll('.pagedjs_page'));
        const blank: number[] = [];
        const clipped: string[] = [];
        const merged: string[] = [];
        pages.forEach((p, pi) => {
          const content = p.querySelector('.pagedjs_page_content')!;
          const ar = content.getBoundingClientRect();
          if (!(content.textContent || '').trim() && !content.querySelector('img')) blank.push(pi + 1);
          content.querySelectorAll('p, li, img, h1, h2, h3, .katex-display, .orz-option, .col').forEach((e) => {
            const r = e.getBoundingClientRect();
            // (an image's own paragraph is the image)
            const what = e.tagName === 'P' && e.querySelector('img') && !(e.textContent || '').trim() ? 'img' : `${e.tagName.toLowerCase()}${e.className ? `.${String(e.className).split(' ')[0]}` : ''}`;
            if (r.height && r.bottom > ar.bottom + 2 && getComputedStyle(e).display !== 'none') clipped.push(`p${pi + 1}:${what}`);
          });
          for (const c of top(content)) {
            if (getComputedStyle(c).display === 'none') continue;
            const kids = Array.from(c.children).filter((k) => (k.textContent || '').trim() || k.querySelector('img'));
            const cw = c.getBoundingClientRect().width;
            if (kids.length && kids.some((k) => k.getBoundingClientRect().width > cw * 0.9)) merged.push(`p${pi + 1}`);
          }
        });
        const last = C.standalone.view.lastResult();
        return { pages: last.pages, cols: last.cols, integrity, blank, clipped, merged };
      }, text);
    }
    const summary = Object.fromEntries(Object.entries(results).map(([d, r]) => [d, `${r.pages} pages ${JSON.stringify(r.cols)}`]));
    // eslint-disable-next-line no-console
    console.log('[C.1] the columns regression:', JSON.stringify(summary, null, 1));
    for (const [doc, r] of Object.entries(results)) {
      expect(r.integrity, doc).toEqual([]);
      expect(r.blank, doc).toEqual([]);
      expect(r.merged, doc).toEqual([]);
      expect(r.pages, doc).toBeGreaterThan(0);
      expect(r.cols.fallback, doc).toBe(0);
      if (doc === 'h_overtall' || doc === 'g_edge') {
        // the documented limit: an over-tall image (taller than a page: h_overtall's 1250 px, g_edge's 600×1400 —
        // orz-markdown keeps an image's given size) is forced onto its page and clipped there, nothing else
        expect(r.clipped.length, doc).toBeGreaterThan(0);
        expect(r.clipped.every((c) => /:(img|div\.col)$/.test(c)), `${doc} ${r.clipped.join(' ')}`).toBe(true);
      } else expect(r.clipped, doc).toEqual([]);
    }
    // the hybrid: long blocks are split column by column, a short block near a page bottom moves whole
    for (const doc of ['a_long', 'b_unequal', 'd_three_custom', 'g_edge']) expect(results[doc]!.cols.split, doc).toBeGreaterThan(0);
    expect(results['c_short_bottom']!.cols).toMatchObject({ split: 0, moved: 1 });
    expect(results['f_exam']!.cols.moved + results['f_exam']!.cols.split).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 300_000);
});
