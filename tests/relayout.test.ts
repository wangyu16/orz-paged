/**
 * Re-layouts and print (claims R.9–R.11; closed loop round 2):
 *
 * R.9  — a webfont CDN that never answers costs at most FIRST_WAIT_MS +
 *        LATE_WAIT_MS before the final layout (Print waited 44.5 s: the
 *        re-flow waited LATE_WAIT_MS a second time);
 * R.10 — a theme switch lays out as a fresh file of the new theme does (the
 *        old pagination's styles — light-playful-1's `--orz-grid` — shaped
 *        the new layout: snapped blocks, another page count);
 * R.11 — print prints the FINAL pages: Cmd/Ctrl+P in the read view while a
 *        layout is provisional waits for the re-flow ("Preparing pages…"),
 *        Cmd/Ctrl+P in edit mode — in the editor or in the preview frame (the
 *        kit's forwarded key) — leaves the editor and prints the final layout
 *        of the current text; a print from the browser's menu in edit mode
 *        shows the pages (never a blank sheet).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { FIRST_WAIT_MS, LATE_WAIT_MS } from '../src/paged/constants.js';
import { assembleReal, bootDone, launch, PICKER_INIT, pagesIdle, routeCdn, serve, tempDir, type Browser, type BrowserContext, type Page, type Route } from './browser-env.js';
import { TEMPLATE_TEXTS } from './helpers.js';
import { prose } from './integrity.js';

const browser: Browser | null = await launch();
const files = tempDir('orz-paged-relayout-');
files.write('fig.svg', readFileSync('tests/fixtures/columns/fig.svg', 'utf8'));
const site = await serve(files.dir);
afterAll(async () => { await browser?.close(); await site.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const APP = '(globalThis.OrzCarrier.standalone)';

/** A context whose webfont stylesheets are held open until `release()` (never, if it is not called). */
async function heldFonts(): Promise<{ ctx: BrowserContext; release(): void }> {
  const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(PICKER_INIT);
  await routeCdn(ctx);
  let release!: () => void;
  const released = new Promise<void>((r) => { release = r; });
  await ctx.route(/^https:\/\/fonts\.googleapis\.com\//, async (route: Route) => { await released; await route.fallback().catch(() => undefined); });
  return { ctx, release };
}

/** A Google Fonts stylesheet for `url`'s families (`family=Name:…`), every face from `src`. */
function fontFaces(url: string, src: string): string {
  const families = [...new URL(url).searchParams.getAll('family')].map((f) => f.split(':')[0]!.replace(/\+/g, ' '));
  return families.map((f) => `@font-face { font-family: '${f}'; font-style: normal; font-weight: 100 900; src: url(${src}) format('woff2'); }\n@font-face { font-family: '${f}'; font-style: italic; font-weight: 100 900; src: url(${src}) format('woff2'); }`).join('\n');
}

/** Record each print: the read view's state at that moment. */
async function recordPrints(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __printed: Array<{ hidden: boolean; provisional: boolean; busy: boolean; text: string }>; OrzCarrier: { standalone: { view: { lastResult(): { provisional: boolean }; busy(): boolean } } } };
    w.__printed = [];
    window.print = () => {
      const v = w.OrzCarrier.standalone.view;
      w.__printed.push({ hidden: document.getElementById('orz-view')!.hidden, provisional: v.lastResult().provisional, busy: v.busy(), text: document.getElementById('orz-pages')!.innerText });
    };
  });
}
const printed = (page: Page): Promise<Array<{ hidden: boolean; provisional: boolean; busy: boolean; text: string }>> => page.evaluate(() => (window as unknown as { __printed: Array<{ hidden: boolean; provisional: boolean; busy: boolean; text: string }> }).__printed);

chrome('re-layouts and print (real Chrome)', () => {
  it('[R.9] webfonts that never answer: the final layout (what Print waits for) comes within FIRST_WAIT_MS + LATE_WAIT_MS plus the layouts, not after a second LATE_WAIT_MS', async () => {
    const { ctx } = await heldFonts(); // never released
    const page = await ctx.newPage();
    const path = files.write('hang.paged.html', await assembleReal(TEMPLATE_TEXTS['report-section']!));
    const t0 = Date.now();
    await page.goto(`file://${path}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.querySelectorAll('#orz-pages .pagedjs_page').length > 0, null, { timeout: 15_000 });
    await page.waitForFunction(`${APP}.view.lastResult() !== null`, null, { timeout: 15_000 }); // the first layout complete (shown page by page)
    expect(await page.evaluate(`${APP}.view.lastResult().provisional`)).toBe(true);
    await pagesIdle(page);
    const total = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[R.9] the final layout ${total} ms after the start (bound ${FIRST_WAIT_MS + LATE_WAIT_MS + 6000} ms)`);
    expect(total).toBeLessThan(FIRST_WAIT_MS + LATE_WAIT_MS + 6000);
    expect(await page.evaluate(`${APP}.view.lastResult().provisional`)).toBe(false);
    expect(await page.evaluate(`${APP}.view.busy()`)).toBe(false);
    await ctx.close();
  }, 90_000);

  it('[R.10] light-playful-1 (a ruled page: the baseline grid) switched to light-neat-1 lays out as a fresh light-neat-1 file: the same page count, no grid, no snapped block, no ruled-paper custom property left', async () => {
    const base = readFileSync('tests/fixtures/columns/a_long.md', 'utf8').replace(/^page_size:.*\n/m, '');
    const withTheme = (t: string): string => base.replace(/^kind: document$/m, `kind: document\ntheme: ${t}\npage_size: A5`);
    const ctx = await browser!.newContext({ viewport: { width: 1100, height: 1200 } });
    await routeCdn(ctx);
    const page = await ctx.newPage();
    files.write('switch.paged.html', await assembleReal(withTheme('light-playful-1')));
    await page.goto(`${site.url}/switch.paged.html`);
    await bootDone(page);
    await pagesIdle(page);
    const before = await page.evaluate(`${APP}.view.lastResult()`) as { grid: { grid: number; snapped: number } };
    expect(before.grid.grid).toBeGreaterThan(0);
    await page.evaluate(`${APP}.view.render(${JSON.stringify(withTheme('light-neat-1'))})`);
    await pagesIdle(page);
    const switched = await page.evaluate(`({ r: ${APP}.view.lastResult(), grid: getComputedStyle(document.querySelector('#orz-pages .pagedjs_page .markdown-body')).getPropertyValue('--orz-grid').trim() })`) as { r: { pages: number; grid: { grid: number; snapped: number } }; grid: string };
    files.write('fresh.paged.html', await assembleReal(withTheme('light-neat-1')));
    await page.goto(`${site.url}/fresh.paged.html`);
    await bootDone(page);
    await pagesIdle(page);
    const fresh = await page.evaluate(`${APP}.view.lastResult()`) as { pages: number; grid: { grid: number; snapped: number } };
    expect(switched.r.grid).toEqual(fresh.grid);
    expect(switched.r.grid.snapped).toBe(0);
    expect(switched.r.pages).toBe(fresh.pages);
    expect(switched.grid).toBe('');
    await ctx.close();
  }, 120_000);

  it('[R.11] Cmd/Ctrl+P in the read view while the layout is provisional: "Preparing pages…", then ONE print of the final layout once the late fonts arrived', async () => {
    const { ctx, release } = await heldFonts();
    const page = await ctx.newPage();
    const path = files.write('print-provisional.paged.html', await assembleReal(TEMPLATE_TEXTS['note']!));
    await page.goto(`file://${path}`, { waitUntil: 'commit' });
    await bootDone(page);
    await page.waitForFunction(() => document.querySelectorAll('#orz-pages .pagedjs_page').length > 0);
    expect(await page.evaluate(`${APP}.view.lastResult().provisional`)).toBe(true);
    await recordPrints(page);
    await page.locator('#orz-pages').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    await page.keyboard.press(`${MOD}+p`);
    await page.waitForTimeout(1500);
    expect(await printed(page)).toEqual([]);
    expect(await page.evaluate(`${APP}.root.textContent.includes('Preparing pages')`)).toBe(true);
    release();
    await page.waitForFunction(() => (window as unknown as { __printed: unknown[] }).__printed.length > 0, null, { timeout: 30_000 });
    await page.waitForTimeout(500);
    const p = await printed(page);
    expect(p.length).toBe(1);
    expect(p[0]).toMatchObject({ hidden: false, provisional: false, busy: false });
    await ctx.close();
  }, 90_000);

  it('[R.11] Cmd/Ctrl+P in edit mode — in the editor, then with the focus in the preview frame (the kit forwards the key) — leaves the editor and prints the FINAL layout of the current text once; the print CSS of edit mode shows the pages, never a blank sheet', async () => {
    const { ctx, release } = await heldFonts();
    const page = await ctx.newPage();
    const path = files.write('print-edit.paged.html', await assembleReal(TEMPLATE_TEXTS['note']!));
    await page.goto(`file://${path}`, { waitUntil: 'commit' });
    await bootDone(page);
    await page.waitForFunction(() => document.querySelectorAll('#orz-pages .pagedjs_page').length > 0);
    await recordPrints(page);
    // in the editor (focus in CodeMirror), right after typing: the final layout of the edited text
    await page.keyboard.press(`${MOD}+e`);
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type('\n\nPrinted from the editor.');
    // a print from the browser's menu here would print the page as it is: the pages, not the editor
    await page.emulateMedia({ media: 'print' });
    const shown = await page.evaluate(() => ({ view: getComputedStyle(document.getElementById('orz-view')!).display, chrome: getComputedStyle(document.getElementById('orz-chrome')!).display, pages: document.querySelectorAll('#orz-pages .pagedjs_page').length }));
    await page.emulateMedia({ media: 'screen' });
    expect(shown.view).not.toBe('none');
    expect(shown.chrome).toBe('none');
    expect(shown.pages).toBeGreaterThan(0);
    await page.keyboard.press(`${MOD}+p`);
    // the fonts are still held: the read view's layout of the edited text is provisional — the print waits for its re-flow
    await page.waitForFunction(() => !(window as unknown as { OrzCarrier: { standalone: { editor(): unknown } } }).OrzCarrier.standalone.editor(), null, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    expect(await printed(page)).toEqual([]);
    release();
    await page.waitForFunction(() => (window as unknown as { __printed: unknown[] }).__printed.length === 1, null, { timeout: 30_000 });
    let p = await printed(page);
    expect(p[0]).toMatchObject({ hidden: false, provisional: false, busy: false });
    expect(p[0]!.text).toContain('Printed from the editor.');
    expect(await page.evaluate(`${APP}.editor()`)).toBeNull();
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(true);
    // with the focus in the preview frame
    await page.keyboard.press(`${MOD}+e`);
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type('\n\nPrinted from the preview.');
    const frame = await (async () => {
      for (let i = 0; i < 150; i++) {
        const f = page.frames().find((x) => x !== page.mainFrame());
        if (f && await f.evaluate(() => document.body.innerText.includes('Printed from the preview.')).catch(() => false)) return f;
        await page.waitForTimeout(200);
      }
      throw new Error('the preview did not show the edit');
    })();
    expect(frame).toBeTruthy();
    await page.frameLocator('iframe').locator('#orz-doc').click({ position: { x: 200, y: 200 } });
    await page.keyboard.press(`${MOD}+p`);
    await page.waitForFunction(() => (window as unknown as { __printed: unknown[] }).__printed.length === 2, null, { timeout: 30_000 });
    await page.waitForTimeout(500);
    p = await printed(page);
    expect(p.length).toBe(2);
    expect(p[1]).toMatchObject({ hidden: false, provisional: false, busy: false });
    expect(p[1]!.text).toContain('Printed from the preview.');
    await ctx.close();
  }, 120_000);

  it('[R.13] a font server that never answers costs its wait once per session: after the first layout gave up on it (FIRST_WAIT_MS + LATE_WAIT_MS), later layouts — a setting, Done after an edit — and Print are final at once (no provisional layout, no re-flow, no second wait)', async () => {
    const { ctx } = await heldFonts(); // never released
    const page = await ctx.newPage();
    const path = files.write('hang-session.paged.html', await assembleReal(TEMPLATE_TEXTS['report-section']!));
    await page.goto(`file://${path}`, { waitUntil: 'commit' });
    await bootDone(page);
    await pagesIdle(page); // the first layout: provisional, then the final one after LATE_WAIT_MS
    const hung = await page.evaluate(() => (window as unknown as { __orzPaged: { stats(): { hung: string[] } } }).__orzPaged.stats().hung);
    expect(hung.some((h) => h.startsWith('sheet:https://fonts.googleapis.com'))).toBe(true);
    await recordPrints(page);
    const waits: number[] = [];
    // a setting re-lays out the pages
    const runs = (): Promise<number> => page.evaluate(() => (window as unknown as { __orzPaged: { stats(): { paginations: number } } }).__orzPaged.stats().paginations);
    const before = await runs();
    let t0 = Date.now();
    await page.evaluate(`${APP}.setSetting({ page_number_style: 'brackets' })`);
    await page.waitForFunction((n) => (window as unknown as { __orzPaged: { stats(): { paginations: number }; busy(): boolean } }).__orzPaged.stats().paginations > n && !(window as unknown as { __orzPaged: { busy(): boolean } }).__orzPaged.busy(), before, { timeout: 30_000, polling: 20 });
    await pagesIdle(page);
    waits.push(Date.now() - t0);
    expect(await page.evaluate(`${APP}.view.lastResult().provisional`)).toBe(false);
    // edit, Done
    await page.keyboard.press(`${MOD}+e`);
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type('\n\nOne more line.');
    t0 = Date.now();
    await page.keyboard.press(`${MOD}+e`);
    await page.waitForFunction(() => (document.getElementById('orz-pages')!.textContent || '').includes('One more line.'), null, { timeout: 20_000 });
    await pagesIdle(page);
    waits.push(Date.now() - t0);
    // Print, twice
    for (let i = 1; i <= 2; i++) {
      t0 = Date.now();
      await page.keyboard.press(`${MOD}+p`);
      await page.waitForFunction((n) => (window as unknown as { __printed: unknown[] }).__printed.length === n, i, { timeout: 30_000 });
      waits.push(Date.now() - t0);
    }
    // eslint-disable-next-line no-console
    console.log(`[R.13] with the font server hanging: setting ${waits[0]} ms, Done ${waits[1]} ms, Print ${waits[2]} ms, Print again ${waits[3]} ms`);
    for (const w of waits) expect(w).toBeLessThan(FIRST_WAIT_MS + 3000);
    expect((await printed(page)).every((p) => !p.provisional && !p.busy)).toBe(true);
    await ctx.close();
  }, 120_000);

  it('[R.13] webfont FILES that never arrive (the font stylesheet answers, its sources hang) and a content library that never arrives (highlight.js held) cost their wait once per session too: after the first layout gave up on them, a setting is final at once (no provisional layout, no re-flow, no second wait)', async () => {
    const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(PICKER_INIT);
    await routeCdn(ctx);
    await ctx.route(/^https:\/\/fonts\.googleapis\.com\//, (route: Route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/css', 'access-control-allow-origin': '*' }, body: fontFaces(route.request().url(), 'https://fonts.gstatic.com/hang.woff2') }));
    await ctx.route(/^https:\/\/fonts\.gstatic\.com\//, () => { /* never answers */ });
    await ctx.route(/^https:\/\/cdnjs\.cloudflare\.com\//, () => { /* never answers */ });
    const page = await ctx.newPage();
    const text = `${TEMPLATE_TEXTS['report-section']!}\n\n\`\`\`python\ndef held(x):\n    return x\n\`\`\`\n`;
    await page.goto(`file://${files.write('hang-files.paged.html', await assembleReal(text))}`, { waitUntil: 'commit' });
    await bootDone(page);
    await pagesIdle(page);
    const hung = await page.evaluate(() => (window as unknown as { __orzPaged: { stats(): { hung: string[] } } }).__orzPaged.stats().hung);
    expect(hung.some((h) => h.startsWith('fonts:'))).toBe(true);
    expect(hung.some((h) => h.startsWith('enhance:') && h.includes('pre code'))).toBe(true);
    const runs = (): Promise<number> => page.evaluate(() => (window as unknown as { __orzPaged: { stats(): { paginations: number } } }).__orzPaged.stats().paginations);
    const before = await runs();
    const t0 = Date.now();
    await page.evaluate(`${APP}.setSetting({ page_number_style: 'brackets' })`);
    await page.waitForFunction((n) => (window as unknown as { __orzPaged: { stats(): { paginations: number }; busy(): boolean } }).__orzPaged.stats().paginations > n && !(window as unknown as { __orzPaged: { busy(): boolean } }).__orzPaged.busy(), before, { timeout: 30_000, polling: 20 });
    await pagesIdle(page);
    const wait = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[R.13] font files and highlight.js hanging: the setting was final in ${wait} ms`);
    expect(wait).toBeLessThan(FIRST_WAIT_MS + 3000);
    expect(await page.evaluate(`${APP}.view.lastResult().provisional`)).toBe(false);
    expect(await runs()).toBe(before + 1); // no re-flow after it
    await ctx.close();
  }, 120_000);

  it('[R.17] a font server that answers only after the session gave up on it (a wide replacement font): the shown pages are laid out once more when the stylesheet and its fonts arrive — they equal a file opened with the fonts at hand — and Print prints that layout', async () => {
    const font = readFileSync('node_modules/katex/dist/fonts/KaTeX_Typewriter-Regular.woff2');
    const route = async (ctx: BrowserContext, held: Promise<void> | null): Promise<void> => {
      await ctx.route(/^https:\/\/fonts\.googleapis\.com\//, async (r: Route) => { if (held) await held; await r.fulfill({ status: 200, headers: { 'content-type': 'text/css', 'access-control-allow-origin': '*' }, body: fontFaces(r.request().url(), 'https://fonts.gstatic.com/wide.woff2') }).catch(() => undefined); });
      await ctx.route(/^https:\/\/fonts\.gstatic\.com\//, (r: Route) => r.fulfill({ status: 200, headers: { 'content-type': 'font/woff2', 'access-control-allow-origin': '*' }, body: font }));
    };
    // long enough that the wide font moves the page breaks
    const text = `${TEMPLATE_TEXTS['report-section']!}\n\n${Array.from({ length: 8 }, (_, i) => `**[W${i}]** ${prose(70 + i, 120)}`).join('\n\n')}\n`;
    const pageTexts = (page: Page): Promise<string[]> => page.evaluate(() => Array.from(document.querySelectorAll('#orz-pages > .pagedjs_pages > .pagedjs_page')).map((p) => (p.querySelector('.pagedjs_page_content')?.textContent || '').replace(/\s+/g, ' ').trim()));
    // the reference: the fonts at hand from the start
    const refCtx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await refCtx.addInitScript(PICKER_INIT);
    await routeCdn(refCtx);
    await route(refCtx, null);
    const refPage = await refCtx.newPage();
    await refPage.goto(`file://${files.write('late-ref.paged.html', await assembleReal(text))}`);
    await bootDone(refPage);
    await pagesIdle(refPage);
    const ref = await pageTexts(refPage);
    await refCtx.close();
    // the session: the font stylesheet held past FIRST_WAIT_MS + LATE_WAIT_MS (given up on: final pages with fallback fonts)
    const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(PICKER_INIT);
    await routeCdn(ctx);
    let release!: () => void;
    const released = new Promise<void>((r) => { release = r; });
    await route(ctx, released);
    const page = await ctx.newPage();
    await page.goto(`file://${files.write('late.paged.html', await assembleReal(text))}`, { waitUntil: 'commit' });
    await bootDone(page);
    await pagesIdle(page);
    expect(await page.evaluate(() => (window as unknown as { __orzPaged: { stats(): { hung: string[] } } }).__orzPaged.stats().hung.some((h) => h.startsWith('sheet:https://fonts.googleapis.com')))).toBe(true);
    const fallback = await pageTexts(page);
    expect(fallback).not.toEqual(ref); // the wide font changes the pagination: the scenario is real
    const runs = await page.evaluate(() => (window as unknown as { __orzPaged: { stats(): { paginations: number } } }).__orzPaged.stats().paginations);
    release();
    await page.waitForFunction((n) => (window as unknown as { __orzPaged: { stats(): { paginations: number } } }).__orzPaged.stats().paginations > n, runs, { timeout: 15_000, polling: 50 });
    await recordPrints(page);
    await page.keyboard.press(`${MOD}+p`);
    await page.waitForFunction(() => (window as unknown as { __printed: unknown[] }).__printed.length === 1, null, { timeout: 30_000 });
    expect(await pageTexts(page)).toEqual(ref);
    const prints = await printed(page);
    expect(prints.length).toBe(1);
    expect(prints[0]!.busy).toBe(false);
    expect(prints[0]!.provisional).toBe(false);
    await ctx.close();
  }, 150_000);

  it('[R.15] one print at a time: Print pressed three times while the pages are laid out opens ONE dialog (the further presses only say so again), with a quiet, announced "Preparing pages… (n of N)" line while it waits (never printed)', async () => {
    const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(PICKER_INIT);
    await routeCdn(ctx);
    const page = await ctx.newPage();
    const path = files.write('print-once.paged.html', await assembleReal(readFileSync('tests/fixtures/big-exam.paged.md', 'utf8')));
    await page.goto(`file://${path}`);
    await bootDone(page);
    await pagesIdle(page);
    await recordPrints(page);
    // a re-layout (a setting), then Print three times at once
    await page.evaluate(`${APP}.setSetting({ page_number_style: 'n-of-N' })`);
    await page.waitForFunction(`${APP}.view.busy()`, null, { timeout: 10_000, polling: 10 });
    await page.keyboard.press(`${MOD}+p`);
    await page.keyboard.press(`${MOD}+p`);
    await page.keyboard.press(`${MOD}+p`);
    const line = await page.waitForFunction(() => { const p = document.querySelector('.orz-paged-progress') as HTMLElement | null; return p && !p.hidden && /Preparing pages\u2026( \(\d+( of \d+)?\))?/.test(p.textContent || '') ? `${p.getAttribute('role')}|${p.textContent}` : null; }, null, { timeout: 10_000, polling: 20 }).then((h) => h.jsonValue());
    expect(line).toMatch(/^status\|Preparing pages/);
    await page.waitForFunction(() => (window as unknown as { __printed: unknown[] }).__printed.length >= 1, null, { timeout: 60_000 });
    await page.waitForTimeout(1500);
    expect((await printed(page)).length).toBe(1);
    expect(await page.evaluate(() => (document.querySelector('.orz-paged-progress') as HTMLElement).hidden)).toBe(true);
    // the line never prints
    expect(readFileSync('src/browser/paged/read-view.ts', 'utf8')).toMatch(/@media print \{[\s\S]*\.orz-paged-progress \{ display: none !important; \}|\.orz-paged-status, \.orz-paged-progress \{ display: none !important; \}/);
    await ctx.close();
  }, 120_000);
});
