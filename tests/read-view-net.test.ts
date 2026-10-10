/**
 * The read view against a slow network and the keyboard's print (claims R.6,
 * R.7; closed loop round 1).
 *
 * R.6 — a CDN that never answers (Google Fonts, cdnjs, jsDelivr, unpkg held
 * open) does not keep the page blank: the pages show within about 4 s, laid
 * out with fallback fonts and unenhanced content (`provisional`); when the
 * requests are let through, ONE re-flow lays out the final pages, keeping the
 * scroll position, and Print (`view.idle()`) waits for it.
 *
 * R.7 — Cmd/Ctrl+P in edit mode (where the page shows the editor, which does
 * not print: the browser printed a blank page) leaves the editor, waits for
 * the read view's layout of the current text and prints the pages; in the
 * read view it is the Print action too (the kit's key, orz-markdown 2.3.0).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { assembleReal, bootDone, launch, PICKER_INIT, pagesIdle, routeCdn, tempDir, type Browser, type Route } from './browser-env.js';
import { readFileSync } from 'node:fs';
import { TEMPLATE_TEXTS } from './helpers.js';

const browser: Browser | null = await launch();
const files = tempDir('orz-paged-net-');
afterAll(async () => { await browser?.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const APP = '(globalThis.OrzCarrier.standalone)';

const RICH = `{{nyml
kind: document
title: Slow network
theme: light-academic-1
}}

# Slow network

${Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} with $x^${i}$ inline math and \`code\`, long enough to wrap onto a second line of the page.`).join('\n\n')}

\`\`\`js
const area = (r) => Math.PI * r ** 2;
\`\`\`

\`\`\`mermaid
graph TD; A-->B;
\`\`\`

$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$
`;

chrome('the read view on a slow network (real Chrome)', () => {
  it('[R.6] fonts, stylesheets and libraries that never answer: pages within ~4 s (provisional), then one re-flow after the requests are let through (final layout, the scroll kept); Print waits for it', async () => {
    const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(PICKER_INIT);
    await routeCdn(ctx);
    // held open until released, then answered as usual (routeCdn: local files, empty webfont stylesheets, the rest refused)
    let release!: () => void;
    const released = new Promise<void>((r) => { release = r; });
    const held: string[] = [];
    await ctx.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)\//, async (route: Route) => {
      held.push(route.request().url());
      await released;
      await route.fallback();
    });
    const page = await ctx.newPage();
    const path = files.write('slow.paged.html', await assembleReal(RICH));
    const t0 = Date.now();
    await page.goto(`file://${path}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.querySelectorAll('#orz-pages .pagedjs_page').length > 0, null, { timeout: 6000, polling: 100 });
    const shown = Date.now() - t0;
    // from the document's parse (DOMContentLoaded: the 1.7 MB file read and its engine compiled, which no network
    // changes) to the pages: the short wait for the held fonts and libraries, then the layout
    const dcl = await page.evaluate(() => Math.round((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).domContentLoadedEventEnd));
    const afterParse = await page.evaluate(() => Math.round(performance.now())) - dcl;
    expect(afterParse, `pages ${afterParse} ms after the parse (${shown} ms in all)`).toBeLessThan(3500);
    expect(shown, `pages after ${shown} ms`).toBeLessThan(8000);
    // (the first layout shows page by page, round 3: its result once all its pages are in)
    await page.waitForFunction(`${APP}.view.lastResult() !== null`, null, { timeout: 30_000 });
    const first = await page.evaluate(`${APP}.view.lastResult()`) as { provisional: boolean; pages: number };
    expect(first.provisional).toBe(true);
    expect(held.some((u) => /fonts\.googleapis/.test(u))).toBe(true);
    expect(held.some((u) => /cdnjs|jsdelivr/.test(u))).toBe(true);
    // the reader scrolls; Print would wait: idle() is pending while the re-flow is due
    await page.evaluate(() => window.scrollTo(0, 700));
    const idle = page.evaluate(`${APP}.view.idle().then(() => 'idle')`) as Promise<string>;
    const early = await Promise.race([idle, new Promise((r) => setTimeout(() => r('waiting'), 1500))]);
    expect(early).toBe('waiting');
    release();
    expect(await idle).toBe('idle');
    const final = await page.evaluate(`${APP}.view.lastResult()`) as { provisional: boolean; pages: number };
    expect(final.provisional).toBe(false);
    expect(await page.evaluate(() => Math.round(document.scrollingElement!.scrollTop))).toBe(700);
    // the released stylesheets apply to the final pages (KaTeX's, answered from the local package)
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#orz-pages .katex')!).fontFamily)).toMatch(/KaTeX/);
    // eslint-disable-next-line no-console
    console.log(`[R.6] pages after ${shown} ms (${afterParse} ms after the parse; provisional, ${first.pages} pages); final ${final.pages} pages after the release`);
    await ctx.close();
  }, 120_000);

  it('[R.7] Cmd/Ctrl+P in edit mode leaves the editor, lays out the current (edited, unsaved) text and prints the pages — never the editor; in the read view it prints the pages once', async () => {
    const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(PICKER_INIT);
    await routeCdn(ctx);
    const page = await ctx.newPage();
    const path = files.write('print-edit.paged.html', await assembleReal(TEMPLATE_TEXTS['note']!));
    await page.goto(`file://${path}`);
    await bootDone(page);
    await pagesIdle(page);
    await page.evaluate(() => { const w = window as unknown as { __printed: Array<{ hidden: boolean; text: string }> }; w.__printed = []; window.print = () => { w.__printed.push({ hidden: document.getElementById('orz-view')!.hidden, text: document.getElementById('orz-pages')!.innerText }); }; });
    await page.keyboard.press(`${MOD}+e`);
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type('\n\nPrinted from edit mode.');
    await page.keyboard.press(`${MOD}+p`);
    await page.waitForFunction(() => (window as unknown as { __printed: unknown[] }).__printed.length === 1, null, { timeout: 30_000 });
    const printed = await page.evaluate(() => (window as unknown as { __printed: Array<{ hidden: boolean; text: string }> }).__printed[0]!);
    expect(printed.hidden).toBe(false);
    expect(printed.text).toContain('Printed from edit mode.');
    expect(await page.evaluate(`${APP}.editor()`)).toBeNull();
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(true);
    expect(await page.evaluate(`${APP}.getText()`)).toContain('Printed from edit mode.');
    // in the read view Cmd/Ctrl+P is the Print action too (the kit's key, orz-markdown 2.3.0): one print of the settled pages
    await page.keyboard.press(`${MOD}+p`).catch(() => undefined);
    await page.waitForFunction(() => (window as unknown as { __printed: unknown[] }).__printed.length === 2, null, { timeout: 30_000 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __printed: unknown[] }).__printed.length)).toBe(2);
    await ctx.close();
  }, 120_000);

  it('[R.14] first open of a 35-page report: the fallback line goes when the layout starts, a quiet announced "Laying out pages…" (role status) shows until the first page, the pages are laid out straight into view (the first page shows while the rest is still being laid out, under aria-busy), and the first page is in view within a few seconds of the parse', async () => {
    const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(PICKER_INIT);
    await routeCdn(ctx);
    const page = await ctx.newPage();
    const path = files.write('first-open.paged.html', await assembleReal(readFileSync('tests/fixtures/report-35.paged.md', 'utf8')));
    await page.goto(`file://${path}`, { waitUntil: 'commit' });
    const status = await page.waitForFunction(() => { const s = document.getElementById('orz-paged-status'); return s && !s.hidden ? { text: s.textContent, role: s.getAttribute('role'), live: s.getAttribute('aria-live'), fallback: document.querySelectorAll('#orz-pages .orz-fallback').length } : null; }, null, { timeout: 30_000, polling: 10 }).then((h) => h.jsonValue());
    expect(status).toEqual({ text: 'Laying out pages\u2026', role: 'status', live: 'polite', fallback: 0 });
    const first = await page.waitForFunction(() => { const p = document.querySelector('#orz-pages .pagedjs_page'); if (!p || !(p.textContent || '').trim()) return null; return { pages: document.querySelectorAll('#orz-pages .pagedjs_page').length, busy: document.getElementById('orz-pages')!.getAttribute('aria-busy'), statusHidden: (document.getElementById('orz-paged-status') as HTMLElement).hidden, t: Math.round(performance.now()), dcl: Math.round((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).domContentLoadedEventEnd) }; }, null, { timeout: 30_000, polling: 10 }).then((h) => h.jsonValue()) as { pages: number; busy: string | null; statusHidden: boolean; t: number; dcl: number };
    await pagesIdle(page);
    const all = await page.evaluate(() => ({ pages: document.querySelectorAll('#orz-pages .pagedjs_page').length, busy: document.getElementById('orz-pages')!.getAttribute('aria-busy'), t: Math.round(performance.now()) }));
    // eslint-disable-next-line no-console
    console.log(`[R.14] first page ${first.t - first.dcl} ms after the parse (${first.t} ms in all), ${first.pages} of ${all.pages} pages then; all at ${all.t} ms`);
    expect(first.pages).toBeLessThan(all.pages); // progressive: shown while the rest was laid out
    expect(first.busy).toBe('true');
    expect(first.statusHidden).toBe(true);
    expect(all.pages).toBeGreaterThanOrEqual(30);
    expect(all.busy).toBeNull();
    expect(first.t - first.dcl).toBeLessThan(4000);
    // the file tells the kit's printDocument when its pages are final (an app printing the assembled file)
    expect(await page.evaluate(async () => { const r = (window as unknown as { __orzPrintReady?: () => Promise<void> }).__orzPrintReady; if (typeof r !== 'function') return 'none'; await r(); return 'ready'; })).toBe('ready');
    await ctx.close();
  }, 120_000);
});
