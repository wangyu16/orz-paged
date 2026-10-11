/**
 * Page zoom never changes the pagination (claim R.16; closed loop round 4):
 * the read view's FIRST layout runs straight into view, and the page zoom —
 * "Automatic" shrinks the pages to a window narrower than a page — was
 * applied when its first page showed, while the rest was still being laid
 * out; the editor preview's fit to its pane likewise. CSS `zoom` changes
 * what Paged.js measures: a 700 px window laid out (and printed) other
 * pages than a wide one. Now a layout always runs at 100 % and the zoom or
 * fit follows when it ends.
 *
 * Oracle: per page, the text of each page (whitespace collapsed) and the page
 * count of the read view at 700 px and 420 px wide, of the editor preview at
 * the default split, and of the pages printed after opening in a 420 px
 * window, all equal those of a 1400 px window (zoom 1 throughout); the
 * whole-document integrity oracle (tests/integrity.ts) holds on each.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { assembleReal, bootDone, launch, PICKER_INIT, pagesIdle, routeCdn, tempDir, type Browser, type Frame, type Page } from './browser-env.js';
import { integrity, prose } from './integrity.js';

const browser: Browser | null = await launch();
const files = tempDir('orz-paged-zoom-');
afterAll(async () => { await browser?.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/** A varied document from a seed: headings, paragraphs, lists, a quote, a table, highlighted code, a two-column block. */
function randomDoc(seed: number): string {
  const parts: string[] = [`{{nyml\nkind: document\ntitle: Random ${seed}\npage_size: ${seed % 2 ? 'Letter' : 'A4'}\n${seed % 3 === 0 ? 'theme: beige-decent-2\n' : ''}}}`];
  for (let s = 0; s < 6; s++) {
    const k = seed * 100 + s * 10;
    parts.push(`## [S${s}] Section ${s + 1}`, `**[P${s}a]** ${prose(k + 1, 90 + (k % 40))}`, `**[P${s}b]** ${prose(k + 2, 60)}`);
    parts.push(Array.from({ length: 4 + (s % 3) }, (_, i) => `- **[L${s}x${i}]** ${prose(k + 3 + i, 8 + i * 3)}`).join('\n'));
    if (s % 2 === 0) parts.push(`> **[Q${s}]** ${prose(k + 9, 40)}`);
    if (s === 1) parts.push(`| H0 | H1 | H2 |\n|---|---|---|\n${Array.from({ length: 18 }, (_, i) => `| [R${i}] ${prose(k + 20 + i, 3)} | ${prose(k + 40 + i, 2)} | ${i} |`).join('\n')}`);
    if (s === 2) parts.push(`\`\`\`python\n${Array.from({ length: 40 }, (_, i) => `def f${i}(x):  # [C${i}] ${prose(k + i, 3)}\n    return x * ${i}`).join('\n')}\n\`\`\``);
    if (s === 4) parts.push(`::::: cols\n:::: col\n**[K1]** ${prose(k + 50, 120)}\n::::\n:::: col\n**[K2]** ${prose(k + 51, 100)}\n::::\n:::::`);
  }
  return `${parts.join('\n\n')}\n`;
}

const DOCS: Array<[string, string]> = [
  ['report-35', readFileSync('tests/fixtures/report-35.paged.md', 'utf8')],
  ['big-exam', readFileSync('tests/fixtures/big-exam.paged.md', 'utf8')],
  ['random-1', randomDoc(1)],
  ['random-2', randomDoc(2)],
];

/** Page-side: each page's text (whitespace collapsed) under `#<rootId>`. */
const pageTexts = (where: Page | Frame, rootId: string): Promise<string[]> =>
  where.evaluate((id) => Array.from(document.querySelectorAll(`#${id} > .pagedjs_pages > .pagedjs_page`)).map((p) => (p.querySelector('.pagedjs_page_content')?.textContent || '').replace(/\s+/g, ' ').trim()), rootId);

async function openRead(name: string, text: string, width: number): Promise<{ page: Page; close(): Promise<void> }> {
  const ctx = await browser!.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(PICKER_INIT);
  await routeCdn(ctx, { highlight: true });
  const page = await ctx.newPage();
  await page.goto(`file://${files.write(`${name}-${width}.paged.html`, await assembleReal(text))}`);
  await bootDone(page);
  await pagesIdle(page);
  return { page, close: () => ctx.close() };
}

/** The first page index whose text differs (or the count), for a readable failure. */
function firstDiff(a: string[], b: string[]): string {
  if (a.length !== b.length) return `${a.length} pages vs ${b.length}`;
  const i = a.findIndex((t, k) => t !== b[k]);
  return i < 0 ? 'same' : `p${i + 1}: ${JSON.stringify(a[i]!.slice(0, 80))} vs ${JSON.stringify(b[i]!.slice(0, 80))}`;
}

chrome('page zoom never changes the pagination (real Chrome)', () => {
  for (const [name, text] of DOCS) {
    it(`[R.16] ${name}: the read view at 700 px and 420 px (Automatic zoom shrinks the pages), the editor preview at the default split (fit to its pane) and the pages printed after opening in a 420 px window lay out the same pages as a 1400 px window at 100 %; the integrity oracle holds on each`, async () => {
      const wide = await openRead(name, text, 1400);
      const ref = await pageTexts(wide.page, 'orz-pages');
      expect(await wide.page.evaluate(() => document.getElementById('orz-pages')!.style.getPropertyValue('--orz-page-zoom'))).toBe('1');
      expect((await integrity(wide.page, text)).problems).toEqual([]);
      await wide.close();
      expect(ref.length).toBeGreaterThan(2);
      for (const width of [700, 420]) {
        const narrow = await openRead(name, text, width);
        const zoom = Number(await narrow.page.evaluate(() => document.getElementById('orz-pages')!.style.getPropertyValue('--orz-page-zoom')));
        expect(zoom).toBeLessThan(1); // the scenario: Automatic shrank the pages
        expect(firstDiff(await pageTexts(narrow.page, 'orz-pages'), ref)).toBe('same');
        expect((await integrity(narrow.page, text)).problems).toEqual([]);
        if (width === 420) {
          // Print: the pages at the moment the browser prints them (print CSS: zoom 1)
          await narrow.page.evaluate(() => {
            const w = window as unknown as { __printed: string[][] };
            w.__printed = [];
            window.print = () => { w.__printed.push(Array.from(document.querySelectorAll('#orz-pages > .pagedjs_pages > .pagedjs_page')).map((p) => (p.querySelector('.pagedjs_page_content')?.textContent || '').replace(/\s+/g, ' ').trim())); };
          });
          await narrow.page.keyboard.press(`${MOD}+p`);
          await narrow.page.waitForFunction(() => (window as unknown as { __printed: string[][] }).__printed.length > 0, null, { timeout: 60_000 });
          const printed = await narrow.page.evaluate(() => (window as unknown as { __printed: string[][] }).__printed);
          expect(printed.length).toBe(1);
          expect(firstDiff(printed[0]!, ref)).toBe('same');
        }
        await narrow.close();
      }
      // the editor preview at the default split: narrower than a page, fit to the pane once laid out
      const ed = await openRead(`${name}-edit`, text, 1280);
      await ed.page.keyboard.press(`${MOD}+e`);
      let frame: Frame | null = null;
      for (let i = 0; i < 150 && !frame; i++) {
        const f = ed.page.frames().find((x) => x !== ed.page.mainFrame());
        if (f && (await f.evaluate(() => document.querySelectorAll('#orz-doc .pagedjs_page').length).catch(() => 0)) > 0) frame = f;
        else await ed.page.waitForTimeout(200);
      }
      expect(frame).not.toBeNull();
      await frame!.waitForFunction(() => !document.getElementById('orz-doc')!.hasAttribute('data-orz-updating') && !(window as unknown as { __orzPaged: { busy(): boolean } }).__orzPaged.busy(), null, { timeout: 90_000, polling: 100 });
      const fit = Number(await frame!.evaluate(() => document.getElementById('orz-doc')!.style.getPropertyValue('--orz-page-zoom')));
      expect(fit).toBeLessThan(1); // the scenario: the pane is narrower than a page
      expect(firstDiff(await pageTexts(frame!, 'orz-doc'), ref)).toBe('same');
      expect((await integrity(ed.page, text, { frame: frame! })).problems).toEqual([]);
      await ed.close();
    }, 300_000);
  }

  it('[R.16] a page zoom stored for the document (125 %, the reader\'s preference by uid) is applied to the empty read view before its first layout: that layout — straight into view — still runs at 100 % (`--orz-page-zoom: 1` while `data-orz-laying-out`) and lays out the same pages as a 1400 px window at 100 %; the zoom follows when it ends (closed loop round 5: removing the forced 100 % left this layout at 125 % — P10)', async () => {
    const text = randomDoc(1).replace('title: Random 1', 'title: Random 1\nuid: doc-zoomstored00000001');
    const wide = await openRead('stored-ref', text, 1400);
    const ref = await pageTexts(wide.page, 'orz-pages');
    await wide.close();
    const ctx = await browser!.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(PICKER_INIT);
    await ctx.addInitScript(() => {
      for (const k of ['reader.pageZoom', 'pageZoom']) localStorage.setItem(`orz-pref:doc-zoomstored00000001:${k}`, JSON.stringify('125'));
      // what the first layout ran at: the zoom on the pages' container whenever a page is added
      const w = window as unknown as { __zooms: string[] };
      w.__zooms = [];
      new MutationObserver(() => {
        const c = document.getElementById('orz-pages');
        if (c && c.hasAttribute('data-orz-laying-out')) w.__zooms.push(c.style.getPropertyValue('--orz-page-zoom'));
      }).observe(document, { subtree: true, childList: true });
    });
    await routeCdn(ctx, { highlight: true });
    const page = await ctx.newPage();
    await page.goto(`file://${files.write('stored-125.paged.html', await assembleReal(text))}`);
    await bootDone(page);
    await pagesIdle(page);
    const r = await page.evaluate(() => ({ zoom: document.getElementById('orz-pages')!.style.getPropertyValue('--orz-page-zoom'), choice: document.getElementById('orz-pages')!.getAttribute('data-orz-page-zoom'), during: [...new Set((window as unknown as { __zooms: string[] }).__zooms)] }));
    expect(r.choice).toBe('125'); // the scenario: the stored zoom reached the view
    expect(r.zoom).toBe('1.25'); // and applies when the layout ends
    expect(r.during).toEqual(['1']); // at 100 % throughout the first layout
    expect(firstDiff(await pageTexts(page, 'orz-pages'), ref)).toBe('same');
    expect((await integrity(page, text)).problems).toEqual([]);
    await ctx.close();
  }, 300_000);
});
