/**
 * Rebuild step 4 — the paged kind on orz-markdown `carrier/app`, the
 * assembled file in real Chrome (claims R.1–R.5, K.1–K.5, E.1–E.3): the read
 * view (Paged.js pages in the page: page size, page furniture, TOC page
 * numbers, front matter, print, the double-buffered re-render), the handle and
 * its paged items (Print, the settings, New document from template…,
 * Version, Page zoom), and the editor with its Paged.js preview frame.
 * Files are assembled with the real bundle and opened over `file:` (and
 * http:); jsDelivr is routed to local files; the picker returns real OPFS
 * handles.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { editHeader, extract, lintHeader, readDocument, UID_PATTERN } from 'orz-markdown/carrier';
import { assemble, newDocument } from '../src/assemble.js';
import { presentationOf } from '../src/presentation.js';
import { resolveSettings } from '../src/doc/settings.js';
import { VERSION } from '../src/version.js';
import { assembleReal, bundle, bootDone, launch, PICKER_INIT, pagesIdle, readOpfs, recordErrors, routeCdn, serve, tempDir, writeOpfs, type Browser, type BrowserContext, type Page } from './browser-env.js';
import { TEMPLATE_TEXTS } from './helpers.js';

const b = await bundle();
const browser: Browser | null = await launch();
const files = tempDir();
const site = await serve(files.dir);
afterAll(async () => { await browser?.close(); await site.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;

const APP = '(globalThis.OrzCarrier.standalone)';
const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';

/** CSS px of a named page size (96 px per inch). */
const SIZES: Record<string, [number, number]> = { A4: [210 / 25.4 * 96, 297 / 25.4 * 96], A5: [148 / 25.4 * 96, 210 / 25.4 * 96], A3: [297 / 25.4 * 96, 420 / 25.4 * 96], Letter: [816, 1056], Legal: [816, 1344] };

async function context(o: { log?: string[] } = {}): Promise<BrowserContext> {
  const ctx = await browser!.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(PICKER_INIT);
  await routeCdn(ctx, o);
  return ctx;
}

/** Open a file:// page of an assembled file (its pages laid out) and put its bytes "on disk" where the OPFS picker finds them. */
async function openFile(ctx: BrowserContext, name: string, html: string, o: { onDisk?: boolean } = {}): Promise<Page> {
  const path = files.write(name, html);
  const page = await ctx.newPage();
  await page.goto(`file://${path}`);
  await bootDone(page);
  await pagesIdle(page);
  if (o.onDisk !== false) await writeOpfs(page, name, html);
  return page;
}

/** Open the handle's list as a pointer does (hover the pencil) and choose its items in order. */
async function chooseInHandle(page: Page, ...names: string[]): Promise<void> {
  await page.getByRole('button', { name: 'Edit and more', exact: true }).hover();
  for (const name of names) await page.getByRole('menuitem', { name, exact: true }).click();
}

/** The items of the handle's list (opened, read, closed). */
async function handleItems(page: Page): Promise<string[]> {
  await page.evaluate(`${APP}.menu.open()`);
  const items = await page.evaluate(`Array.from(${APP}.root.querySelectorAll('[role=menuitem]')).map((b) => b.getAttribute('aria-label') || b.textContent.replace(/[⌘›]|Ctrl\\+[A-Z]|[A-Z]$/g, '').trim())`) as string[];
  await page.evaluate(`${APP}.menu.close()`);
  return items;
}

const picks = (page: Page): Promise<Array<{ suggestedName: string; name: string }>> => page.evaluate(() => (window as unknown as { __orzPicks: Array<{ suggestedName: string; name: string }> }).__orzPicks);

const pageBox = (page: Page): Promise<{ w: number; h: number; n: number }> => page.evaluate(() => {
  const p = document.querySelector('#orz-pages .pagedjs_page') as HTMLElement;
  return { w: p.offsetWidth, h: p.offsetHeight, n: document.querySelectorAll('#orz-pages .pagedjs_page').length };
});

chrome('the read view: Paged.js pages in the page (real Chrome)', () => {
  it('[R.1] inline and cdn files, over file: and http:, lay every template out as pages in #orz-pages with its page size and title; the runtime is injected once; no page errors', async () => {
    const ctx = await context();
    const page = await ctx.newPage();
    const errors = recordErrors(page);
    const names = ['article-page', 'report-page', 'exam-section', 'letter', 'cv-modern', 'note'];
    for (const name of names) {
      const text = TEMPLATE_TEXTS[name]!;
      for (const delivery of ['inline', 'cdn'] as const) {
        const file = `${name}-${delivery}.paged.html`;
        files.write(file, await assembleReal(text, { delivery }));
        for (const url of [`file://${files.dir}/${file}`, `${site.url}/${file}`]) {
          await page.goto(url);
          await bootDone(page);
          const n = await pagesIdle(page);
          const id = `${name} ${delivery} ${url.slice(0, 5)}`;
          expect(n, id).toBeGreaterThan(0);
          const [w, h] = SIZES[presentationOf(text).pageSize]!;
          const box = await pageBox(page);
          expect(Math.abs(box.w - w), `${id} width ${box.w}`).toBeLessThan(2);
          expect(Math.abs(box.h - h), `${id} height ${box.h}`).toBeLessThan(2);
          const r = await page.evaluate(() => ({
            title: document.title,
            runtimes: document.querySelectorAll('script#orz-paged-runtime').length,
            fallback: !!document.querySelector('#orz-pages .orz-fallback'),
            inPage: !!document.querySelector('#orz-view > #orz-pages > .pagedjs_pages'),
            frames: document.querySelectorAll('iframe').length,
            deferred: document.querySelectorAll('link[media="not all"]').length,
          }));
          expect(r, id).toEqual({ title: readDocument(text, { kind: 'paged' }).title, runtimes: 1, fallback: false, inPage: true, frames: 0, deferred: 0 });
        }
      }
    }
    expect(errors).toEqual([]);
    await ctx.close();
  }, 300_000);

  it('[R.2] page furniture: running headers and footers and page numbers in the margin boxes, front matter renumbered clean (its pages bare, the body from 1), TOC page numbers of the headings\' pages', async () => {
    const ctx = await context();
    const text = editHeader(TEMPLATE_TEXTS['report-page']!, { header_left: 'ACME Corp', footer_left: 'Confidential draft' });
    const page = await openFile(ctx, 'furniture.paged.html', await assembleReal(text));
    expect(resolveSettings(text).frontMatterClean).toBe(true);
    const r = await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll<HTMLElement>('#orz-pages .pagedjs_page'));
      const after = (el: Element | null): string => (el ? getComputedStyle(el, '::after').content : '');
      return pages.map((p) => ({
        front: p.classList.contains('pagedjs_orz-front_page'),
        no: p.style.getPropertyValue('--orz-pageno'),
        topLeft: after(p.querySelector('.pagedjs_margin-top-left > .pagedjs_margin-content')),
        bottomLeft: after(p.querySelector('.pagedjs_margin-bottom-left > .pagedjs_margin-content')),
        numberBox: !!p.querySelector('.pagedjs_margin-bottom-right.hasContent'),
        marginsShown: getComputedStyle(p.querySelector('.pagedjs_margin-bottom')!).display !== 'none',
        headings: Array.from(p.querySelectorAll('.pagedjs_page_content h2')).map((h) => h.textContent),
      }));
    });
    const front = r.filter((p) => p.front);
    const body = r.filter((p) => !p.front);
    expect(front.length).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(0);
    for (const p of front) expect(p.marginsShown).toBe(false);
    body.forEach((p, i) => {
      expect(p.no).toBe(`"${i + 1}"`);
      expect(p.topLeft).toBe('"ACME Corp"');
      expect(p.bottomLeft).toBe('"Confidential draft"');
      expect(p.numberBox).toBe(true);
      expect(p.marginsShown).toBe(true);
    });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--orz-body-pages'))).toBe(`"${body.length}"`);
    // the TOC: one item per section heading, its number the body number of the heading's page
    const toc = await page.evaluate(() => Array.from(document.querySelectorAll('#orz-pages .orz-toc .orz-toc-item')).map((li) => [li.querySelector('.orz-toc-text')!.textContent, li.querySelector('.orz-toc-page')!.textContent]));
    expect(toc.length).toBeGreaterThan(2);
    let matched = 0;
    for (const [t, n] of toc) {
      expect(n, t!).toMatch(/^\d+$/);
      const at = body.findIndex((p) => p.headings.includes(t));
      if (at >= 0) { expect(n, t!).toBe(String(at + 1)); matched++; }
    }
    expect(matched).toBeGreaterThan(2); // the section (h2) entries, each with its page's body number
    expect(toc.map(([t]) => t)).not.toContain(readDocument(text, { kind: 'paged' }).title); // the cover's title is not a section
    await ctx.close();
  });

  it('[R.3] print: the chrome, the desk, the shadows and the reader\'s zoom do not print; the pages print as they are laid out; Print (the handle\'s, right after Edit) prints after the layout settles', async () => {
    const ctx = await context();
    const page = await openFile(ctx, 'print.paged.html', await assembleReal(TEMPLATE_TEXTS['note']!));
    await page.evaluate(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++; }; });
    expect((await handleItems(page)).slice(0, 2)).toEqual(['Edit', 'Print']);
    await chooseInHandle(page, 'Print');
    await page.waitForFunction(() => (window as unknown as { __printed: number }).__printed === 1);
    await page.evaluate(`${APP}.view.setZoom('125')`);
    await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(() => ({
      chrome: getComputedStyle(document.getElementById('orz-chrome')!).display,
      bg: getComputedStyle(document.documentElement).backgroundColor,
      shadow: getComputedStyle(document.querySelector('#orz-pages .pagedjs_page')!).boxShadow,
      zoom: getComputedStyle(document.querySelector('#orz-pages .pagedjs_pages')!).zoom,
      pages: document.querySelectorAll('#orz-pages .pagedjs_page').length,
    }));
    expect(r).toMatchObject({ chrome: 'none', bg: 'rgb(255, 255, 255)', shadow: 'none', zoom: '1' });
    expect(r.pages).toBeGreaterThan(0);
    await page.emulateMedia({ media: 'screen' });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#orz-pages .pagedjs_pages')!).zoom)).toBe('1.25');
    await ctx.close();
  });

  it('[R.4] a re-render is double-buffered: the old pages stay until the new ones are laid out, the scroll position is kept, the old pagination\'s styles go', async () => {
    const ctx = await context();
    const page = await openFile(ctx, 'rerender.paged.html', await assembleReal(TEMPLATE_TEXTS['report-section']!));
    await page.evaluate(() => window.scrollTo(0, 900));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(500);
    await page.evaluate(() => {
      const w = window as unknown as { __empty: number };
      w.__empty = 0;
      new MutationObserver(() => { if (!document.querySelector('#orz-pages .pagedjs_page')) w.__empty++; }).observe(document.getElementById('orz-pages')!, { childList: true, subtree: true });
    });
    await page.evaluate(`${APP}.setSetting({ theme: 'light-neat-2' })`);
    await pagesIdle(page);
    const r = await page.evaluate(() => ({
      empty: (window as unknown as { __empty: number }).__empty,
      y: window.scrollY,
      inserted: document.querySelectorAll('style[data-pagedjs-inserted-styles]').length,
      stage: document.querySelectorAll('.orz-paged-stage, .orz-paged-buffer, style[data-orz-paged-measure]').length,
      theme: document.getElementById('orz-view')!.getAttribute('data-orz-theme'),
    }));
    expect(r.empty).toBe(0);
    expect(Math.abs(r.y - before)).toBeLessThan(2);
    expect(r.stage).toBe(0);
    expect(r.theme).toBe('light-neat-2');
    // one pagination's styles (the base and the inserted sheets of the latest), not the sum of every render
    const once = r.inserted;
    await page.evaluate(`${APP}.setSetting({ theme: 'beige-decent-1' })`);
    await pagesIdle(page);
    expect(await page.evaluate(() => document.querySelectorAll('style[data-pagedjs-inserted-styles]').length)).toBe(once);
    await ctx.close();
  });

  it('[R.5] the version: the header\'s dynamic_choices decide what the pages show (the exam\'s answer key hidden, then shown)', async () => {
    const ctx = await context();
    const text = TEMPLATE_TEXTS['exam-section']!;
    const page = await openFile(ctx, 'versions.paged.html', await assembleReal(text));
    expect(await page.locator('#orz-pages .orz-answer-key').count()).toBe(0);
    await page.evaluate(`${APP}.setSetting({ dynamic_choices: { multiline: 'answer-key: show' } })`);
    await pagesIdle(page);
    expect(await page.locator('#orz-pages .orz-answer-key').count()).toBeGreaterThan(0);
    await ctx.close();
  });
});

chrome('the handle and its paged items (real Chrome)', () => {
  it('[K.1] one control at rest (the pencil); its list: Edit, Print, Save, Download a copy, New document, Save as new copy, the settings (Version only while the document offers versions), New document from template…, Page zoom — each with its icon', async () => {
    const ctx = await context();
    const exam = await openFile(ctx, 'handle-exam.paged.html', await assembleReal(TEMPLATE_TEXTS['exam-section']!));
    const shown = await exam.evaluate(`Array.from(${APP}.root.querySelectorAll('button, a')).filter((e) => e.getClientRects().length > 0).map((e) => e.getAttribute('aria-label'))`);
    expect(shown).toEqual(['Edit and more']);
    expect(await handleItems(exam)).toEqual(['Edit', 'Print', 'Save', 'Download a copy', 'New document', 'Save as new copy', 'Theme', 'Page size', 'Template (page size)', 'Page numbers', 'Number style', 'Version', 'New document from template…', 'Page zoom']);
    // every item has its icon (round 4: Template, Page numbers, Number style, Version and Page zoom had none)
    await exam.evaluate(`${APP}.menu.open()`);
    const bare = await exam.evaluate(`Array.from(${APP}.root.querySelectorAll('[role=menuitem]')).filter((b) => !b.querySelector('svg path')).map((b) => b.getAttribute('aria-label') || b.textContent.trim())`);
    await exam.evaluate(`${APP}.menu.close()`);
    expect(bare).toEqual([]);
    const note = await openFile(ctx, 'handle-note.paged.html', await assembleReal(TEMPLATE_TEXTS['note']!));
    expect(await handleItems(note)).not.toContain('Version');
    // the version item follows the document: a header with choices brings it
    await note.evaluate(`${APP}.setSetting({ dynamic_choices: { multiline: 'audience: student' } })`);
    await pagesIdle(note);
    expect(await handleItems(note)).toContain('Version');
    await ctx.close();
  });

  it('[K.2] a setting writes the header (one undoable edit, unsaved), re-paginates (Page size → Letter), and the saved file is the text\'s assembly', async () => {
    const ctx = await context();
    const text = TEMPLATE_TEXTS['note']!;
    const page = await openFile(ctx, 'settings.paged.html', await assembleReal(text));
    expect(presentationOf(text).pageSize).toBe('A4');
    await chooseInHandle(page, 'Page size');
    await page.getByRole('menuitemradio', { name: 'Letter (8.5 × 11 in)', exact: true }).click();
    expect(await page.evaluate(`${APP}.getText()`)).toBe(editHeader(text, { page_size: 'Letter' }));
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(true);
    await pagesIdle(page);
    expect((await pageBox(page)).w).toBe(816);
    await chooseInHandle(page, 'Page numbers');
    await page.getByRole('menuitemradio', { name: 'Top right', exact: true }).click();
    await chooseInHandle(page, 'Number style');
    await page.getByRole('menuitemradio', { name: 'Page 1 of N', exact: true }).click();
    await chooseInHandle(page, 'Template (page size)');
    await page.getByRole('menuitemradio', { name: 'article-section — Letter', exact: true }).click();
    await chooseInHandle(page, 'Theme');
    await page.getByRole('menuitemradio', { name: 'Neat 2', exact: false }).first().click();
    const t = await page.evaluate(`${APP}.getText()`) as string;
    const s = resolveSettings(t);
    expect(s).toMatchObject({ pageSize: 'Letter', pageNumberPosition: 'header-right', pageNumberStyle: 'page-n-of-N', template: 'article-section' });
    expect(presentationOf(t).theme).not.toBe(presentationOf(text).theme);
    await pagesIdle(page);
    expect(await page.evaluate(() => !!document.querySelector('#orz-pages .pagedjs_margin-top-right.hasContent'))).toBe(true);
    // undo walks back one setting at a time
    await page.locator('#orz-pages').click({ position: { x: 5, y: 5 } });
    for (let i = 0; i < 5; i++) await page.keyboard.press(`${MOD}+z`);
    expect(await page.evaluate(`${APP}.getText()`)).toBe(text);
    await page.keyboard.press(`${MOD}+Shift+z`);
    const one = await page.evaluate(`${APP}.getText()`) as string;
    expect(one).toBe(editHeader(text, { page_size: 'Letter' }));
    await page.keyboard.press(`${MOD}+s`);
    await page.waitForFunction(`!${APP}.isDirty()`);
    expect(await readOpfs(page, 'settings.paged.html') === assemble(one, { engineSource: b.iife })).toBe(true);
    await ctx.close();
  });

  it('[K.3] New document from template… is a submenu of the 12 templates (the kit\'s action items) and saves a fresh file of the chosen one (its skeleton, carrier paged, a new uid, lint clean, the file\'s delivery) — the current text is never replaced', async () => {
    const ctx = await context();
    const text = TEMPLATE_TEXTS['note']!;
    for (const delivery of ['inline', 'cdn'] as const) {
      const page = await openFile(ctx, `from-${delivery}.paged.html`, await assembleReal(text, { delivery }));
      await chooseInHandle(page, 'New document from template…');
      const items = await page.evaluate(`Array.from(${APP}.root.querySelectorAll('.orz-handle__sub .orz-handle__item')).map((b) => (b.querySelector('.orz-handle__label') || b).textContent)`) as string[];
      expect(items).toEqual(['Article — title page', 'Article — title section', 'Report — title page', 'Report — title section', 'Exam — cover page', 'Exam — title section', 'Letter', 'Cover letter', 'CV — classic', 'CV — modern', 'CV — elegant', 'Note']);
      await page.evaluate(`Array.from(${APP}.root.querySelectorAll('.orz-handle__sub .orz-handle__item')).find((b) => (b.querySelector('.orz-handle__label') || b).textContent === 'Exam — title section').click()`);
      await page.waitForFunction(() => (window as unknown as { __orzPicks: unknown[] }).__orzPicks.length === 1);
      expect((await picks(page))[0]!.suggestedName).toBe('exam-section.paged.html');
      let made: string | null = null;
      for (let i = 0; i < 50 && !made; i++) { made = await readOpfs(page, 'exam-section.paged.html'); if (!made) await page.waitForTimeout(100); }
      const ex = extract(made!)!;
      expect(ex.delivery).toBe(delivery);
      expect(ex.shell).toBe(VERSION);
      const info = readDocument(ex.text, { kind: 'paged' });
      expect(info.meta.uid).toMatch(UID_PATTERN);
      expect(lintHeader(ex.text, 'paged').filter((l) => l.level === 'error')).toEqual([]);
      expect(resolveSettings(ex.text).template).toBe('exam-section');
      expect(ex.text).toBe(newDocument({ template: 'exam-section', uid: info.meta.uid as string }));
      expect(made === (delivery === 'cdn' ? assemble(ex.text, { delivery }) : assemble(ex.text, { engineSource: b.iife }))).toBe(true);
      // the opened document is untouched
      expect(await page.evaluate(`${APP}.getText()`)).toBe(text);
      expect(await page.evaluate(`${APP}.isDirty()`)).toBe(false);
      // the kit's own New document makes the default template's file
      const n = await page.evaluate(`${APP}.newDocument()`) as { ok: boolean };
      expect(n.ok).toBe(true);
      await page.close();
    }
    await ctx.close();
  });

  it('[K.4] Version (a kit setting with choicesFor / apply / hidden) writes the header\'s dynamic_choices (one undoable edit) and the pages follow; "default" (the key not set) removes the key', async () => {
    const ctx = await context();
    const text = TEMPLATE_TEXTS['exam-section']!;
    const page = await openFile(ctx, 'version-pick.paged.html', await assembleReal(text));
    await chooseInHandle(page, 'Version');
    const items = await page.evaluate(`Array.from(${APP}.root.querySelectorAll('.orz-handle__sub .orz-handle__item')).map((b) => [(b.querySelector('.orz-handle__label') || b).textContent, b.getAttribute('aria-checked')])`);
    expect(items).toEqual([['answer key: hide', 'true'], ['answer key: show', 'false'], ['answer key: default', 'false']]);
    await page.evaluate(`Array.from(${APP}.root.querySelectorAll('.orz-handle__sub .orz-handle__item')).find((b) => (b.querySelector('.orz-handle__label') || b).textContent === 'answer key: show').click()`);
    const shown = await page.evaluate(`${APP}.getText()`) as string;
    expect(shown).toBe(editHeader(text, { dynamic_choices: { multiline: 'answer-key: show' } }));
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(true);
    await pagesIdle(page);
    expect(await page.locator('#orz-pages .orz-answer-key').count()).toBeGreaterThan(0);
    expect(await page.evaluate(`${APP}.undo()`)).toBe(true);
    expect(await page.evaluate(`${APP}.getText()`)).toBe(text);
    await pagesIdle(page);
    expect(await page.locator('#orz-pages .orz-answer-key').count()).toBe(0);
    await ctx.close();
  });

  it('[K.5] Page zoom is a reader preference (the kit\'s readerControls.choices, key pageZoom): the pages scale (Fit width / 100 % / 125 %), the document stays saved, the choice persists by uid across a reload and never enters the file', async () => {
    const ctx = await context();
    const text = newDocument({ template: 'note', uid: 'doc-zoomtest0001' });
    const html = await assembleReal(text);
    const page = await openFile(ctx, 'zoom.paged.html', html);
    const zoom = (): Promise<string> => page.evaluate(() => getComputedStyle(document.querySelector('#orz-pages .pagedjs_pages')!).zoom);
    expect(await zoom()).toBe('1');
    await chooseInHandle(page, 'Page zoom');
    const items = await page.evaluate(`Array.from(${APP}.root.querySelectorAll('.orz-handle__sub .orz-handle__item')).map((b) => [(b.querySelector('.orz-handle__label') || b).textContent, b.getAttribute('aria-checked')])`);
    expect(items).toEqual([['Automatic', 'true'], ['Fit width', 'false'], ['100%', 'false'], ['125%', 'false']]);
    await page.evaluate(`Array.from(${APP}.root.querySelectorAll('.orz-handle__sub .orz-handle__item')).find((b) => (b.querySelector('.orz-handle__label') || b).textContent === '125%').click()`);
    expect(await zoom()).toBe('1.25');
    expect(await page.evaluate(`${APP}.isDirty()`)).toBe(false);
    expect(await page.evaluate(`${APP}.getText()`)).toBe(text);
    expect(await page.evaluate(() => localStorage.getItem('orz-pref:doc-zoomtest0001:reader.pageZoom'))).toBe('"125"');
    await page.reload();
    await bootDone(page);
    await pagesIdle(page);
    expect(await zoom()).toBe('1.25');
    await page.evaluate(`${APP}.view.setZoom('fit')`);
    const fit = Number(await zoom());
    const w = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(fit * 793.7 - (w - 32))).toBeLessThan(4);
    // a narrow window: automatic shrinks the page to fit, never above 100 %
    await page.evaluate(`${APP}.view.setZoom('auto')`);
    await page.setViewportSize({ width: 500, height: 800 });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#orz-pages .pagedjs_pages')!).zoom) < 1);
    // saving writes the text's assembly only
    await page.evaluate(`${APP}.setSetting({ title: 'Zoomed' })`);
    await page.evaluate(`${APP}.save()`);
    const saved = (await readOpfs(page, 'zoom.paged.html'))!;
    expect(saved === assemble(editHeader(text, { title: 'Zoomed' }), { engineSource: b.iife })).toBe(true);
    expect(extract(saved)!.text).toBe(editHeader(text, { title: 'Zoomed' }));
    await ctx.close();
  });
});

type Ed = { getText(): string; setText(t: string): void; setHeader(c: Record<string, unknown>): void; save(): Promise<{ ok: boolean; via?: string }>; ready: Promise<unknown>; isDirty(): boolean; undo(): boolean };

/** The editor's preview frame (the one whose #orz-doc is the paged preview). */
async function previewFrame(page: Page): Promise<import('playwright-core').Frame> {
  for (let i = 0; i < 100; i++) {
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue;
      if (await f.evaluate(() => !!document.querySelector('#orz-doc[data-orz-paged-preview] .pagedjs_page')).catch(() => false)) return f;
    }
    await page.waitForTimeout(150);
  }
  throw new Error('no paged preview frame');
}

chrome('the editor with a Paged.js preview (real Chrome)', () => {
  it('[E.1] Edit mounts the kit\'s editor: a sandboxed preview frame running the paged runtime (pages in #orz-doc, scaled to the pane), the settings and Version in its toolbar, the repository link; the preview follows edits and theme changes', async () => {
    const ctx = await context();
    const text = TEMPLATE_TEXTS['exam-section']!;
    const page = await openFile(ctx, 'edit.paged.html', await assembleReal(text));
    await page.getByRole('button', { name: 'Edit and more', exact: true }).click();
    await page.evaluate(`${APP}.editor().ready`);
    const frame = await previewFrame(page);
    const f = await frame.evaluate(() => ({
      runtime: typeof (window as unknown as { __orzPaged?: unknown }).__orzPaged,
      apply: typeof (window as unknown as { __orzPreviewApply?: unknown }).__orzPreviewApply,
      pages: document.querySelectorAll('#orz-doc .pagedjs_page').length,
      zoom: Number(getComputedStyle(document.querySelector('#orz-doc .pagedjs_pages')!).zoom),
      anchors: document.querySelectorAll('#orz-doc .pagedjs_page [data-src-line]').length,
    }));
    expect(f.runtime).toBe('object');
    expect(f.apply).toBe('function');
    expect(f.pages).toBeGreaterThan(0);
    expect(f.zoom).toBeLessThanOrEqual(1);
    expect(f.anchors).toBeGreaterThan(0); // line → page: the blocks keep their source lines inside the pages
    const sandbox = await page.evaluate(`Array.from(${APP}.root.querySelectorAll('.orz-editor-host')).map((h) => h.shadowRoot.querySelector('iframe').getAttribute('sandbox'))[0]`);
    expect(sandbox).toBe('allow-scripts allow-same-origin'); // a standalone file: page (FC-19 §8.4)
    const tools = await page.evaluate(`Array.from(${APP}.root.querySelector('.orz-editor-host').shadowRoot.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') || b.textContent)`) as string[];
    expect(tools).toEqual(expect.arrayContaining(['Theme', 'Page size', 'Template (page size)', 'Page numbers', 'Number style', 'Version']));
    expect(await page.evaluate(`Array.from(${APP}.root.querySelectorAll('a')).map((a) => a.getAttribute('href'))`)).toContain('https://github.com/wangyu16/orz-paged');
    // typing re-paginates the preview
    await page.evaluate(`${APP}.editor().setText(${APP}.editor().getText() + '\\n\\nFRESHLY TYPED PARAGRAPH\\n')`);
    await frame.waitForFunction(() => (document.getElementById('orz-doc')!.textContent ?? '').includes('FRESHLY TYPED PARAGRAPH'), null, { timeout: 20_000 });
    // its block carries its 0-based line of the whole text (the scroll sync maps that line to its page)
    const typedText = await page.evaluate(`${APP}.editor().getText()`) as string;
    const line = typedText.split('\n').indexOf('FRESHLY TYPED PARAGRAPH');
    const anchor = await frame.evaluate(() => {
      const p = Array.from(document.querySelectorAll('#orz-doc .pagedjs_page p')).find((x) => x.textContent === 'FRESHLY TYPED PARAGRAPH');
      return p ? [p.getAttribute('data-src-line'), p.closest('.pagedjs_page')!.getAttribute('data-page-number')] : null;
    });
    expect(anchor?.[0]).toBe(String(line));
    expect(Number(anchor?.[1])).toBeGreaterThan(0);
    // a header setting from the toolbar: one undoable edit; the frame follows the theme
    await page.evaluate(`${APP}.editor().setHeader({ theme: 'light-neat-1' })`);
    await page.waitForFunction(`Array.from(${APP}.root.querySelectorAll('.orz-editor-host')).some((h) => (h.shadowRoot.querySelector('iframe').srcdoc || '').includes('orz-theme-light-neat-1'))`, null, { timeout: 20_000 });
    const after = await previewFrame(page);
    expect(await after.evaluate(() => document.getElementById('orz-doc')!.className)).toContain('orz-theme-light-neat-1');
    await ctx.close();
  }, 120_000);

  it('[E.2] Edit → type → Save writes exactly assemble(text) with the file\'s delivery and includes (never the live DOM); the file reopens with the text', async () => {
    const ctx = await context();
    const text = TEMPLATE_TEXTS['report-section']!;
    const includes = { 'parts/a.md': 'Included part\n' };
    for (const [name, o] of [['typed-inline.paged.html', {}], ['typed-cdn.paged.html', { delivery: 'cdn' as const }], ['typed-includes.paged.html', { includes }]] as const) {
      const page = await openFile(ctx, name, await assembleReal(text, o));
      await page.getByRole('button', { name: 'Edit and more', exact: true }).click();
      await page.evaluate(`${APP}.editor().ready`);
      await page.evaluate(`${APP}.editor().focus()`);
      await page.keyboard.press(isMac ? 'Meta+ArrowDown' : 'Control+End');
      await page.keyboard.type('\nTyped in Chrome.');
      await page.evaluate(() => { const m = document.createElement('div'); m.textContent = 'LIVE-DOM-MARKER'; document.body.append(m); });
      const typed = await page.evaluate(`${APP}.getText()`) as string;
      expect(typed).toContain('Typed in Chrome.');
      await page.keyboard.press(`${MOD}+s`);
      await page.waitForFunction(`!${APP}.isDirty()`);
      const written = (await readOpfs(page, name))!;
      const expected = (o as { delivery?: string }).delivery === 'cdn' ? assemble(typed, o) : assemble(typed, { ...o, engineSource: b.iife });
      expect(written === expected, name).toBe(true);
      const shell = written.replace(/<script id="orz-engine">[\s\S]*?<\/script>/, '');
      expect(shell.includes('LIVE-DOM-MARKER')).toBe(false);
      expect(shell.includes('pagedjs_page')).toBe(false); // no laid-out page is saved
      expect(extract(written)!.includes ?? {}).toEqual((o as { includes?: Record<string, string> }).includes ?? {});
      const reopened = await openFile(ctx, `re-${name}`, written, { onDisk: false });
      expect(await reopened.evaluate(`${APP}.getText()`)).toBe(typed);
      expect(await reopened.locator('#orz-pages').textContent()).toContain('Typed in Chrome.');
      await reopened.close();
      await page.close();
    }
    await ctx.close();
  }, 120_000);

  it('[E.3] Done leaves edit mode and the read view lays out the edited text; the preview never prints (the read view does)', async () => {
    const ctx = await context();
    const page = await openFile(ctx, 'done.paged.html', await assembleReal(TEMPLATE_TEXTS['note']!));
    const ed = await page.evaluate(`(() => { const e = ${APP}.edit(); e.setText(e.getText() + '\\n\\nAFTER DONE\\n'); return true; })()`);
    expect(ed).toBe(true);
    await page.evaluate(`${APP}.leave()`);
    await pagesIdle(page);
    expect(await page.locator('#orz-pages').textContent()).toContain('AFTER DONE');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('orz-view')!).display)).not.toBe('none');
    const frameCss = await page.evaluate(() => (document.documentElement.outerHTML.includes('@media print') ? 'page has print rules' : ''));
    expect(frameCss).toBe('page has print rules');
    await ctx.close();
  });
});
