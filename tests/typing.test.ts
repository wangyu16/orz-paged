/**
 * Typing stays fast on a long document (claim E.4; closed loop round 1:
 * typing froze — the Version setting's `hidden` rendered the whole document
 * after each pause, and a forced pagination ran while keys kept arriving).
 * A 24-page exam is opened in real Chrome, Edit, then 60 characters are
 * typed in bursts (110 ms apart, a 700 ms pause after every 15): the time
 * from each key to the next painted frame (p90 ≤ 100 ms) and the page's long
 * tasks while typing (none over 200 ms) are measured; the preview may lag
 * and catches up after the typing stops.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { assembleReal, bootDone, launch, PICKER_INIT, pagesIdle, routeCdn, tempDir, type Browser } from './browser-env.js';

const browser: Browser | null = await launch();
const files = tempDir('orz-paged-typing-');
afterAll(async () => { await browser?.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

chrome('typing on a long document (real Chrome)', () => {
  it('[E.4] on a 24-page exam, per-key latency p90 ≤ 100 ms and no long task over 200 ms while typing (Version hidden is a cheap text test; pagination waits for a pause, never forced); the preview catches up after', async () => {
    const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(PICKER_INIT);
    await routeCdn(ctx);
    const page = await ctx.newPage();
    const path = files.write('big.paged.html', await assembleReal(readFileSync('tests/fixtures/big-exam.paged.md', 'utf8')));
    await page.goto(`file://${path}`);
    await bootDone(page);
    const pages = await pagesIdle(page);
    expect(pages).toBeGreaterThanOrEqual(20);
    await page.keyboard.press(`${MOD}+e`);
    const frame = await (async () => {
      for (let i = 0; i < 100; i++) {
        const f = page.frames().find((x) => x !== page.mainFrame());
        if (f && await f.evaluate(() => document.querySelectorAll('#orz-doc .pagedjs_page').length).catch(() => 0) > 0) return f;
        await page.waitForTimeout(200);
      }
      throw new Error('no preview pages');
    })();
    // the preview laid out (its runtime idle: the first pagination and a re-flow after late fonts)
    await frame.evaluate(() => (window as unknown as { __orzPaged: { idle(): Promise<void> } }).__orzPaged.idle());
    await page.waitForTimeout(500);
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.evaluate(() => {
      const w = window as unknown as { __lat: number[]; __lt: number[] };
      w.__lat = [];
      w.__lt = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
      window.addEventListener('keydown', (e) => {
        const t = e.timeStamp;
        requestAnimationFrame(() => setTimeout(() => w.__lat.push(performance.now() - t), 0));
      }, true);
    });
    const word = 'xq';
    let typed = '';
    const trip: number[] = [];
    for (let i = 0; i < 60; i++) {
      const c = word[i % 2]!;
      const k0 = Date.now();
      await page.keyboard.type(c);
      trip.push(Date.now() - k0);
      typed += c;
      await page.waitForTimeout(i % 15 === 14 ? 700 : 110);
    }
    const r = await page.evaluate(() => { const w = window as unknown as { __lat: number[]; __lt: number[] }; return { lat: [...w.__lat], lt: [...w.__lt] }; });
    const lat = [...r.lat].sort((a, b) => a - b);
    const ks = [...trip].sort((a, b) => a - b);
    // per key: the key event's round trip (dispatched, handled by the page: the audit's measure; 0.7.3: median 10 ms,
    // max 45 ms); also the key to the next painted frame (informative: headless Chrome paints at its own pace)
    const p90 = ks[Math.floor(ks.length * 0.9)]!;
    const median = ks[Math.floor(ks.length / 2)]!;
    const t0 = Date.now();
    await frame.waitForFunction((s) => document.body.innerText.includes(s), typed, { timeout: 60_000, polling: 250 });
    // eslint-disable-next-line no-console
    console.log(`[E.4] ${pages} pages: per key median ${median} ms, p90 ${p90} ms, max ${ks[ks.length - 1]} ms (key→next frame median ${lat[Math.floor(lat.length / 2)]!.toFixed(0)} ms, p90 ${lat[Math.floor(lat.length * 0.9)]!.toFixed(0)} ms); long tasks while typing: ${r.lt.join(', ') || 'none'}; the preview caught up ${Date.now() - t0} ms after the last key`);
    expect(lat.length).toBeGreaterThanOrEqual(55);
    expect(p90).toBeLessThanOrEqual(100);
    expect(ks[ks.length - 1]).toBeLessThanOrEqual(250);
    expect(r.lt.filter((d) => d > 200)).toEqual([]);
    await ctx.close();
  }, 240_000);

  it('[E.5] typing again after a pause that started a pagination: no freeze (key round trip max ≤ 800 ms, no long task over 700 ms; the stale pagination is abandoned at its next page), the preview marked "updating…" while behind, caught up within 12 s of the last key (the frame acknowledges within 1 s, so the kit\'s pacing stays short), and the read view marked while it re-lays out after Done', async () => {
    const ctx = await browser!.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(PICKER_INIT);
    await routeCdn(ctx);
    const page = await ctx.newPage();
    const path = files.write('big-pause.paged.html', await assembleReal(readFileSync('tests/fixtures/big-exam.paged.md', 'utf8')));
    await page.goto(`file://${path}`);
    await bootDone(page);
    expect(await pagesIdle(page)).toBeGreaterThanOrEqual(20);
    await page.keyboard.press(`${MOD}+e`);
    const frame = await (async () => {
      for (let i = 0; i < 100; i++) {
        const f = page.frames().find((x) => x !== page.mainFrame());
        if (f && await f.evaluate(() => document.querySelectorAll('#orz-doc .pagedjs_page').length).catch(() => 0) > 0) return f;
        await page.waitForTimeout(200);
      }
      throw new Error('no preview pages');
    })();
    await frame.evaluate(() => (window as unknown as { __orzPaged: { idle(): Promise<void> } }).__orzPaged.idle());
    await page.waitForTimeout(500);
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.press('Enter');
    await page.evaluate(() => {
      const w = window as unknown as { __lt: number[] };
      w.__lt = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
    });
    // a word, then a pause long enough for the preview to start its pagination (1.5 s), then typing again through it
    type Stats = { paginations: number; abandoned: number; measured: number };
    const stats = (): Promise<Stats> => frame.evaluate(() => (window as unknown as { __orzPaged: { stats(): Stats } }).__orzPaged.stats());
    const before = await stats();
    await page.keyboard.type('Alpha ');
    await page.waitForTimeout(1800);
    // no pagination's pages are swapped in while the reader types (a stale one is abandoned instead)
    await frame.evaluate(() => { const w = window as unknown as { __swaps: number }; w.__swaps = 0; new MutationObserver(() => { w.__swaps++; }).observe(document.getElementById('orz-doc')!, { childList: true }); });
    const marked = await frame.evaluate(() => document.getElementById('orz-doc')!.hasAttribute('data-orz-updating'));
    const trip: number[] = [];
    let typed = '';
    for (let i = 0; i < 40; i++) {
      const c = 'kw'[i % 2]!;
      const k0 = Date.now();
      await page.keyboard.type(c);
      trip.push(Date.now() - k0);
      typed += c;
      await page.waitForTimeout(80);
    }
    const lt = await page.evaluate(() => [...(window as unknown as { __lt: number[] }).__lt]);
    const swaps = await frame.evaluate(() => (window as unknown as { __swaps: number }).__swaps);
    const during = await stats();
    const behind = await frame.evaluate(() => document.getElementById('orz-doc')!.hasAttribute('data-orz-updating'));
    const t0 = Date.now();
    await frame.waitForFunction((s) => document.body.innerText.includes(s) && !document.getElementById('orz-doc')!.hasAttribute('data-orz-updating'), typed, { timeout: 30_000, polling: 100 });
    const caughtUp = Date.now() - t0;
    const max = Math.max(...trip);
    // eslint-disable-next-line no-console
    console.log(`[E.5] after a pause: key round trip max ${max} ms (median ${[...trip].sort((a, b) => a - b)[20]} ms); long tasks ${lt.join(', ') || 'none'}; the preview caught up ${caughtUp} ms after the last key`);
    expect(marked, 'the preview is marked while its pagination of the new text runs').toBe(true);
    expect(behind, 'and while the editor is ahead of it').toBe(true);
    expect(max).toBeLessThanOrEqual(800);
    expect(lt.filter((d) => d > 700)).toEqual([]);
    expect(caughtUp).toBeLessThanOrEqual(12_000);
    expect(swaps, 'no pages swapped in while typing').toBe(0);
    expect(during.abandoned - before.abandoned, 'the stale pagination was abandoned').toBeGreaterThanOrEqual(1);
    expect(during.measured, 'no stage styled for measuring: the fonts are known').toBe(before.measured);
    // one more key after a settled preview: the next layout follows within the short pacing (the frame acknowledged
    // within 1 s, not after its whole layout: the kit waits twice the acknowledged time)
    await frame.evaluate(() => (window as unknown as { __orzPaged: { idle(): Promise<void> } }).__orzPaged.idle());
    await page.waitForTimeout(300);
    await page.keyboard.type('Z');
    const t1 = Date.now();
    await frame.waitForFunction((s) => document.body.innerText.includes(s) && !document.getElementById('orz-doc')!.hasAttribute('data-orz-updating'), `${typed}Z`, { timeout: 30_000, polling: 100 });
    const single = Date.now() - t1;
    // eslint-disable-next-line no-console
    console.log(`[E.5] one key on a settled preview: shown after ${single} ms`);
    expect(single).toBeLessThanOrEqual(12_000); // ~8 s on a 26-page exam (pacing ~2.6 s + the layout); ~16 s when the frame acknowledged only after its layout
    // Done: the read view lays out the edited text under the quiet mark, which goes when the pages are final
    const seen = page.evaluate(() => new Promise<boolean>((res) => {
      const p = document.getElementById('orz-pages')!;
      const mo = new MutationObserver(() => { if (p.hasAttribute('data-orz-updating')) { mo.disconnect(); res(true); } });
      mo.observe(p, { attributes: true, attributeFilter: ['data-orz-updating'] });
      setTimeout(() => res(p.hasAttribute('data-orz-updating')), 10_000);
    }));
    await page.keyboard.press(`${MOD}+e`);
    expect(await seen).toBe(true);
    await pagesIdle(page);
    expect(await page.evaluate(() => document.getElementById('orz-pages')!.hasAttribute('data-orz-updating'))).toBe(false);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('orz-pages')!, '::before').content)).toBe('none');
    await ctx.close();
  }, 240_000);
});
