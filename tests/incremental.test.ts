/**
 * The editor preview's incremental re-layout equals a whole layout (claims
 * E.7, E.8; closed loop round 4 — mutants P01, P03, P04, P05, P09, P11 of
 * round 4 survived the round-3 tests, and an edit undone left the preview
 * half old, half new, "updating…" for good).
 *
 * Oracle: the preview after the edits — per page its text and the geometry
 * of its blocks — equals the preview of a fresh editor opened on the final
 * text, and the whole-document integrity oracle holds on it; where the
 * layout must be a whole one (the layout key changed, a provisional or a
 * ruled-grid layout), `stats().incremental` does not move.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PREVIEW_RETRY_MS } from '../src/paged/constants.js';
import { assembleReal, bootDone, launch, PICKER_INIT, pagesIdle, routeCdn, tempDir, type Browser, type BrowserContext, type Frame, type Page, type Route } from './browser-env.js';
import { integrity, prose } from './integrity.js';

const browser: Browser | null = await launch();
const files = tempDir('orz-paged-incr-');
files.write('fig.svg', readFileSync('tests/fixtures/columns/fig.svg', 'utf8'));
afterAll(async () => { await browser?.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
let opened = 0;

type Stats = { incremental: number; last: Record<string, number> };
interface Editor { ctx: BrowserContext; page: Page; frame: Frame; settle(): Promise<void>; stats(): Promise<Stats> }

/** Open `text` in a read view, Edit, and wait for the preview's first layout. */
async function openEditor(text: string, o: { hold?: (ctx: BrowserContext) => Promise<void> } = {}): Promise<Editor> {
  const ctx = await browser!.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(PICKER_INIT);
  await routeCdn(ctx, { highlight: true });
  if (o.hold) await o.hold(ctx);
  const page = await ctx.newPage();
  await page.goto(`file://${files.write(`d${++opened}.paged.html`, await assembleReal(text))}`, { waitUntil: o.hold ? 'commit' : 'load' });
  await bootDone(page);
  if (!o.hold) await pagesIdle(page);
  await page.keyboard.press(`${MOD}+e`);
  let frame: Frame | null = null;
  for (let i = 0; i < 200 && !frame; i++) {
    const f = page.frames().find((x) => x !== page.mainFrame());
    if (f && (await f.evaluate(() => document.querySelectorAll('#orz-doc .pagedjs_page').length).catch(() => 0)) > 0) frame = f;
    else await page.waitForTimeout(200);
  }
  if (!frame) throw new Error('no preview pages');
  const settle = async (): Promise<void> => {
    await page.waitForTimeout(300);
    await frame!.waitForFunction(() => !document.getElementById('orz-doc')!.hasAttribute('data-orz-updating') && !(window as unknown as { __orzPaged: { busy(): boolean } }).__orzPaged.busy() && !document.querySelector('[data-orz-interim]'), null, { timeout: 90_000, polling: 100 });
    await page.waitForTimeout(200);
  };
  if (!o.hold) await settle();
  const stats = (): Promise<Stats> => frame!.evaluate(() => (window as unknown as { __orzPaged: { stats(): Stats } }).__orzPaged.stats());
  return { ctx, page, frame, settle, stats };
}

/** Replace the editor's text (one edit). */
async function setText(page: Page, text: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.insertText(text);
}

/** Per page of the preview: its text, and the geometry of its blocks (page-relative, px) and its page numbers. */
const signature = (frame: Frame): Promise<string[]> => frame.evaluate(() => Array.from(document.querySelectorAll('#orz-doc > .pagedjs_pages > .pagedjs_page')).map((p) => {
  const pr = p.getBoundingClientRect();
  const z = pr.width / ((p as HTMLElement).offsetWidth || pr.width); // the pane's fit
  const cs = getComputedStyle(p);
  const geo = Array.from(p.querySelectorAll('p, li, h1, h2, h3, h4, td, pre, .cols, .col, img')).map((e) => {
    const r = e.getBoundingClientRect();
    return `${e.tagName}@${Math.round((r.left - pr.left) / z)},${Math.round((r.top - pr.top) / z)},${Math.round(r.height / z)}`;
  }).join(' ');
  return `n=${p.getAttribute('data-page-number')} pno=${cs.getPropertyValue('--orz-pageno')} N=${cs.getPropertyValue('--orz-body-pages')} | ${(p.querySelector('.pagedjs_page_content')?.textContent || '').replace(/\s+/g, ' ').trim()} | ${geo}`;
}));

function firstDiff(a: string[], b: string[]): string {
  if (a.length !== b.length) return `${a.length} pages vs ${b.length} in a fresh layout`;
  const i = a.findIndex((t, k) => t !== b[k]);
  return i < 0 ? 'same' : `p${i + 1}: ${a[i]!.slice(0, 160)}\n  fresh: ${b[i]!.slice(0, 160)}`;
}

/** Edit `t0` into each of `edits` in turn (each laid out), then compare with a fresh editor on the last text. */
async function compare(t0: string, edits: string[]): Promise<{ diff: string; incremental: number; problems: string[] }> {
  const ed = await openEditor(t0);
  const before = (await ed.stats()).incremental;
  for (const t of edits) { await setText(ed.page, t); await ed.page.waitForTimeout(1200); await ed.settle(); }
  const after = (await ed.stats()).incremental;
  const got = await signature(ed.frame);
  const problems = (await integrity(ed.page, edits[edits.length - 1]!, { frame: ed.frame })).problems;
  await ed.ctx.close();
  const fresh = await openEditor(edits[edits.length - 1]!);
  const want = await signature(fresh.frame);
  await fresh.ctx.close();
  return { diff: firstDiff(got, want), incremental: after - before, problems };
}

const para = (seed: number, n = 150): string => `**[P${seed}]** ${prose(seed, n)}`;
const hdr = (extra = ''): string => `{{nyml\nkind: document\ntitle: Incremental\nuid: doc-incrtest00000001\npage_size: A5\nheader_center: Incremental\npage_number_position: footer-right\npage_number_style: page-n-of-N\n${extra}}}\n\n`;
const sections = (n: number, per: number, ins: Record<number, string> = {}, words = 150): string => Array.from({ length: n }, (_, s) => `## [S${s}] Section ${s + 1}\n\n${Array.from({ length: per }, (_, j) => para(s * 10 + j, words)).join('\n\n')}${ins[s] ? `\n\n${ins[s]}` : ''}`).join('\n\n');

describe('the interim swaps keep the view (source)', () => {
  it('[E.6] the pages\' CSS (preview frame and read view) sets `overflow-anchor: none` and each interim swap restores the scroll position it found (round 4)', () => {
    expect(readFileSync('src/browser/paged/preview.ts', 'utf8')).toMatch(/#orz-doc \{[^}]*overflow-anchor: none;/);
    expect(readFileSync('src/browser/paged/read-view.ts', 'utf8')).toMatch(/#orz-view \{[^}]*overflow-anchor: none;/);
    expect(readFileSync('src/paged/runtime.ts', 'utf8')).toMatch(/const top = se\.scrollTop;\s*if \(shownPages\[index\]\) shownPages\[index\]!\.replaceWith\(copy\);\s*else shownPages\[shownPages\.length - 1\]\?\.after\(copy\);\s*if \(se\.scrollTop !== top\) se\.scrollTop = top;/);
  });
});

chrome('the preview\'s incremental re-layout equals a whole layout (real Chrome)', () => {
  it('[E.7] the layout key: a theme switch, a page size, a version choice, the font size, a margin and custom CSS in the header lay the preview out whole (no incremental re-layout) and equal a fresh layout', async () => {
    const body = `${sections(5, 2)}\n\n<div data-show-when="answer-key=show">**[KEY]** ${prose(7, 120)}</div>\n`;
    // each change in place (the same header lines: the body's source lines, and so its blocks, stay the same — only
    // the layout key tells the layouts apart); a theme or page size also rebuilds the preview frame (the kit follows
    // the presentation), the page CSS keys and the versions do not
    const base = { theme: 'light-academic-1', page_size: 'A5', font_size: '12', margin_top: '20', choice: 'hide', css: '0.01em' };
    const head = (v: typeof base): string => (`{{nyml\nkind: document\ntitle: Incremental\nuid: doc-incrtest00000001\npage_number_position: footer-right\npage_number_style: page-n-of-N\n` + `theme: ${v.theme}\npage_size: ${v.page_size}\nfont_size: ${v.font_size}\nmargin_top: ${v.margin_top}\ndynamic_choices: |\n  answer-key: ${v.choice}\ncustom_css: |\n  p { letter-spacing: ${v.css}; }\n}}\n\n`);
    for (const change of [{ theme: 'beige-decent-2' }, { page_size: 'A4' }, { choice: 'show' }, { font_size: '13' }, { margin_top: '35' }, { css: '0.04em' }]) {
      const r = await compare(head(base) + body, [head({ ...base, ...change }) + body]);
      const what = JSON.stringify(change);
      expect(r.diff, what).toBe('same');
      expect(r.incremental, what).toBe(0);
      expect(r.problems, what).toEqual([]);
    }
  }, 600_000);

  it('[E.7] a restart is at a block boundary before the change, never inside the changed block: words inserted at the START of a paragraph that runs over a page break (its later page starts inside it) re-lay out incrementally and equal a fresh layout', async () => {
    const t0 = hdr() + sections(6, 2, {}, 210);
    const t1 = t0.replace('**[P30]** ', '**[P30]** inserted words at the start of a paragraph that runs over a page break, enough to move its break ');
    const r = await compare(t0, [t1]);
    expect(r.diff).toBe('same');
    expect(r.incremental).toBe(1);
    expect(r.problems).toEqual([]);
  }, 300_000);

  it('[E.7] pages swapped in by an abandoned progressive layout are dirty: an edit near the start, abandoned mid-way (its interim pages in view) by undoing it and editing near the end, lays out from the first swapped page and equals a fresh layout of the final text', async () => {
    const t0 = hdr() + sections(8, 2);
    const near = t0.replace('**[P20]** ', `**[P20]** ${prose(500, 90)} `);
    const end = t0.replace('**[P71]** ', `**[P71]** ${prose(501, 30)} `);
    const ed = await openEditor(t0);
    await setText(ed.page, near);
    await ed.frame.waitForFunction(() => document.querySelectorAll('[data-orz-interim]').length >= 2, null, { timeout: 30_000, polling: 20 });
    await setText(ed.page, end);
    await ed.page.waitForTimeout(1200);
    await ed.settle();
    const got = await signature(ed.frame);
    const problems = (await integrity(ed.page, end, { frame: ed.frame })).problems;
    await ed.ctx.close();
    const fresh = await openEditor(end);
    const want = await signature(fresh.frame);
    await fresh.ctx.close();
    expect(firstDiff(got, want)).toBe('same');
    expect(problems).toEqual([]);
  }, 300_000);

  it('[E.7] a two-column block and a long table across pages: an edit after them re-lays out without restarting inside them (or falls back to a whole layout) and equals a fresh layout', async () => {
    const cols = readFileSync('tests/fixtures/columns/a_long.md', 'utf8');
    const table = `${hdr()}${sections(1, 2)}\n\n| a | b |\n|---|---|\n${Array.from({ length: 70 }, (_, i) => `| [r${i}] ${prose(i, 3)} | ${i} |`).join('\n')}\n\n${sections(2, 2)}`;
    // (and a block the column handler laid out as plain flow — a row taller than a column page: Paged.js splits it)
    const overtall = readFileSync('tests/fixtures/columns/h_overtall.md', 'utf8');
    for (const [t0, t1] of [[cols, `${cols}\n\n${para(901)}\n`], [table, `${table}\n\n${para(902)}\n`], [cols, cols.replace('**[L7]**', `**[L7]** ${prose(903, 20)}`)], [overtall, `${overtall}\n\n${para(904)}\n`]] as const) {
      const r = await compare(t0, [t1]);
      expect(r.diff).toBe('same');
      expect(r.problems).toEqual([]);
    }
  }, 400_000);

  it('[E.7] an edit inside a long fence (a line inserted in 150 lines of argparse, highlighted, over several pages) lays the preview out whole (no incremental re-layout: restarted before the fence, a later page broke it a line away from a fresh layout — closed loop round 5) and equals a fresh layout; an edit before the fence stays incremental and equal', async () => {
    const code = `\`\`\`python\n${readFileSync('tests/fixtures/code/argparse-3.12-1200-1500.py', 'utf8').split('\n').slice(0, 150).join('\n')}\n\`\`\``;
    const t0 = hdr() + `${sections(2, 2)}\n\n${code}\n\n${sections(2, 2)}`;
    const inside = t0.replace(/(\n {8}self\._)/, '\n        # an inserted comment line$1');
    expect(inside).not.toBe(t0);
    const r = await compare(t0, [inside]);
    expect(r.diff).toBe('same');
    expect(r.incremental).toBe(0);
    expect(r.problems).toEqual([]);
    const before = await compare(t0, [t0.replace('**[P10]** ', `**[P10]** ${prose(77, 40)} `)]);
    expect(before.diff).toBe('same');
    expect(before.incremental).toBe(1);
    expect(before.problems).toEqual([]);
  }, 400_000);

  it('[E.7] a ruled page (light-playful-1\'s baseline grid) is laid out whole after an edit (no incremental re-layout) and equals a fresh layout', async () => {
    const t0 = hdr('theme: light-playful-1\n') + sections(6, 2);
    const t1 = hdr('theme: light-playful-1\n') + sections(6, 2, { 3: `> **[QUOTE]** ${prose(555, 30)}\n\n${para(556)}` });
    const r = await compare(t0, [t1]);
    expect(r.diff).toBe('same');
    expect(r.incremental).toBe(0);
    expect(r.problems).toEqual([]);
  }, 300_000);

  it('[E.7] a provisional layout (webfonts still loading) is followed by a whole layout: an edit made while the fonts are held re-lays out whole (no incremental re-layout)', async () => {
    let release!: () => void;
    const released = new Promise<void>((r) => { release = r; });
    const t0 = hdr('theme: light-academic-1\n') + sections(5, 2);
    const ed = await openEditor(t0, { hold: async (ctx) => { await ctx.route(/^https:\/\/fonts\.googleapis\.com\//, async (route: Route) => { await released; await route.fallback().catch(() => undefined); }); } });
    try {
      // the preview's first layout done, provisional (the fonts held): edit while it is
      await ed.frame.waitForFunction(() => { const r = (window as unknown as { __orzPaged: { progress(): unknown; stats(): { last: { done?: number } } } }).__orzPaged; return document.querySelectorAll('#orz-doc .pagedjs_page').length > 2 && !r.progress() && r.stats().last.done !== undefined; }, null, { timeout: 30_000, polling: 100 });
      const before = await ed.frame.evaluate(() => (window as unknown as { __orzPaged: { stats(): { incremental: number; paginations: number } } }).__orzPaged.stats());
      await setText(ed.page, t0.replace('**[P41]** ', `**[P41]** ${prose(600, 20)} `));
      // the edit's layout done: a pagination more, none running, no interim page
      await ed.frame.waitForFunction((n) => { const r = (window as unknown as { __orzPaged: { progress(): unknown; stats(): { paginations: number } } }).__orzPaged; return r.stats().paginations > n && !r.progress() && !document.querySelector('[data-orz-interim]'); }, before.paginations, { timeout: 30_000, polling: 100 });
      await ed.page.waitForTimeout(300);
      expect((await ed.stats()).incremental).toBe(before.incremental);
    } finally {
      release();
      await ed.ctx.close();
    }
  }, 300_000);

  it('[E.8] an edit undone while a progressive layout runs (a key typed and deleted: the kit sends no render for the same text) never leaves the preview mixed or "updating…": the frame lays the last text out again after the pause, and the pages equal the editor\'s text', async () => {
    const t0 = hdr() + sections(8, 2);
    const ed = await openEditor(t0);
    await setText(ed.page, t0.replace('**[P11]** ', `**[P11]** ${prose(700, 60)} `));
    await ed.frame.waitForFunction(() => document.querySelectorAll('[data-orz-interim]').length >= 2, null, { timeout: 30_000, polling: 20 });
    await ed.page.keyboard.type('x');
    await ed.page.waitForTimeout(80);
    await ed.page.keyboard.press('Backspace');
    const t = Date.now();
    await ed.frame.waitForFunction(() => !document.getElementById('orz-doc')!.hasAttribute('data-orz-updating') && !document.querySelector('[data-orz-interim]') && !(window as unknown as { __orzPaged: { busy(): boolean } }).__orzPaged.busy(), null, { timeout: PREVIEW_RETRY_MS + 20_000, polling: 100 });
    // eslint-disable-next-line no-console
    console.log(`[E.8] the preview settled ${Date.now() - t} ms after the edit was undone`);
    const text = await ed.page.evaluate(() => (globalThis as unknown as { OrzCarrier: { standalone: { getText(): string } } }).OrzCarrier.standalone.getText());
    expect((await integrity(ed.page, text, { frame: ed.frame })).problems).toEqual([]);
    await ed.ctx.close();
  }, 300_000);
});
