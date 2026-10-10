/**
 * The table of contents is laid out WITH the pages (claim R.8, closed loop
 * round 2): the runtime builds the list on the stage before Paged.js lays
 * out (text, leader, a fixed-width placeholder number; the heading filter
 * and `max_level` of the TOC element), and after the layout sets only the
 * numbers — in every fragment of a TOC split across pages — from the page
 * each heading starts on. Before, the list was filled into the laid-out
 * pages: it pushed what followed it off its page (a report's "Findings"
 * section never printed).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { assemble, newDocument } from '../src/assemble.js';
import { bundle, launch, pagesIdle, routeCdn, serve, tempDir, type Browser, type Page } from './browser-env.js';
import { integrity } from './integrity.js';

describe('[R.8] the TOC is built before the layout (source)', () => {
  it('[R.8] the runtime builds the list on the stage (before Paged.js) and only sets the numbers after the layout', () => {
    const src = readFileSync('src/paged/runtime.ts', 'utf8');
    expect(src).toMatch(/applyDynamicChoices\(stage, input\.dynamicChoices\);\s*buildToc\(stage\);/);
    expect(src).toMatch(/renumber\(target, input\.frontMatterClean\);\s*fillTocNumbers\(target\);/);
    expect(src).not.toMatch(/function fillToc\(/);
  });
});

const browser: Browser | null = await launch();
const files = tempDir('orz-paged-toc-');
const site = await serve(files.dir);
afterAll(async () => { await browser?.close(); await site.close(); files.clean(); });
const chrome = browser ? describe : describe.skip;

const S = 'The measured response follows the predicted curve closely across the full range of inputs.';

/** A probe document: a TOC (inline or on its own page), then `n` tagged sections (every third with a sub-section). */
function tocDoc(n: number, o: { placement?: 'page'; size?: string; extra?: string; clean?: boolean } = {}): string {
  const head = `{{nyml\nkind: document\ntitle: TOC probe\ntheme: light-academic-1\npage_size: ${o.size ?? 'A5'}${o.clean ? '\nfront_matter: clean' : ''}\n}}\n\n{{nyml\nkind: toc\ntitle: Contents\nmax_level: 3${o.placement ? `\nplacement: ${o.placement}` : ''}\n}}\n\n**[AFTERTOC]** ${S} ${S}\n\n`;
  const body = Array.from({ length: n }, (_, i) => `## Section ${i + 1} heading text\n\n**[S${i}]** ${S}\n\n${i % 3 === 0 ? `### Sub ${i + 1}.a\n\n**[T${i}]** ${S}\n\n#### Deeper ${i + 1}.a.i (below max_level)\n\n**[U${i}]** ${S}\n\n` : ''}`).join('');
  return `${head}${body}${o.extra ?? ''}**[END]** done.\n`;
}

interface Entry { text: string; page: string; level: string }
interface Shown { entries: Entry[]; headings: { text: string; page: string; split: boolean }[]; pages: number; tocPages: number[] }

async function open(name: string, text: string): Promise<Page> {
  const b = await bundle();
  files.write(name, assemble(text, { engineSource: b.iife }));
  const ctx = await browser!.newContext({ viewport: { width: 1100, height: 1200 } });
  await routeCdn(ctx);
  const page = await ctx.newPage();
  await page.goto(`${site.url}/${name}`);
  await page.waitForFunction(() => !!(globalThis as { OrzCarrier?: { standalone?: unknown } }).OrzCarrier?.standalone);
  await pagesIdle(page);
  return page;
}

/** The TOC entries (every fragment, in order) and the content's headings with the (body) number of the page each starts on. */
async function shown(page: Page): Promise<Shown> {
  await page.evaluate('window.__name = window.__name || ((f) => f)');
  return page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll<HTMLElement>('#orz-pages .pagedjs_page'));
    const noOf = (p: HTMLElement): string => p.style.getPropertyValue('--orz-pageno').replace(/"/g, '') || p.getAttribute('data-page-number') || '';
    // an entry Paged.js split across pages counts once (its first fragment; the number is set in every fragment)
    const entries = Array.from(document.querySelectorAll('#orz-pages .orz-toc .orz-toc-item:not([data-split-from])')).map((li) => ({
      text: li.querySelector('.orz-toc-text')?.textContent || '',
      page: li.querySelector('.orz-toc-page')?.textContent || (document.querySelector(`#orz-pages .orz-toc-item[data-split-from="${li.getAttribute('data-ref')}"] .orz-toc-page`)?.textContent ?? ''),
      level: (/orz-toc-l(\d)/.exec(li.className) || [])[1] || '',
    }));
    const headings = Array.from(document.querySelectorAll<HTMLElement>('#orz-pages .pagedjs_page_content :is(h1, h2, h3)'))
      .filter((h) => !h.closest('.orz-el-toc, .orz-el-report-title, .orz-el-article-title, .orz-el-exam-title'))
      .map((h) => ({ text: (h.textContent || '').trim(), page: noOf(h.closest('.pagedjs_page') as HTMLElement), split: h.hasAttribute('data-split-from') }));
    const tocPages = pages.map((p, i) => (p.querySelector('.orz-toc-item') ? i + 1 : 0)).filter(Boolean);
    return { entries, headings, pages: pages.length, tocPages };
  });
}

chrome('[R.8] the TOC laid out with the pages (real Chrome)', () => {
  it('[R.8] the stock report-section template prints every section (its "Findings" with its table); the TOC lists the sections with their pages; nothing lost', async () => {
    const text = newDocument({ template: 'report-section' });
    const page = await open('report-section.paged.html', text);
    const all = await page.evaluate(() => document.getElementById('orz-pages')!.textContent || '');
    expect(all).toContain('The analysis surfaced the following key results');
    expect(all).toContain('Describe the third observation here.');
    const s = await shown(page);
    expect(s.entries.map((e) => e.text)).toEqual(expect.arrayContaining(['Executive Summary', 'Background', 'Findings', 'Recommendations']));
    for (const e of s.entries) expect(e.page, e.text).toBe(s.headings.find((h) => h.text === e.text)!.page);
    expect((await integrity(page, text)).problems).toEqual([]);
    await page.context().close();
  });

  it('[R.8] an inline TOC of 6 and of 12 sections at A5 loses nothing (the content after it, every section, in order)', async () => {
    for (const n of [6, 12]) {
      const text = tocDoc(n);
      const page = await open(`toc${n}inline.paged.html`, text);
      expect((await integrity(page, text)).problems, `toc${n}inline`).toEqual([]);
      const s = await shown(page);
      expect(s.entries.length).toBe(n + Math.ceil(n / 3));
      for (const e of s.entries) expect(e.page, e.text).toBe(s.headings.find((h) => h.text === e.text)!.page);
      await page.context().close();
    }
  });

  it('[R.8] a 40-entry TOC on its own pages (front_matter: clean) keeps every entry across its pages, each number the body page its heading starts on; levels follow max_level', async () => {
    const text = tocDoc(30, { placement: 'page', clean: true });
    const page = await open('toc40.paged.html', text);
    const s = await shown(page);
    expect(s.entries.length).toBe(40);
    expect(s.tocPages.length).toBeGreaterThan(1); // the list split across pages like any list
    expect(s.entries.map((e) => e.text)).toEqual(s.headings.map((h) => h.text));
    for (const e of s.entries) expect(e.page, e.text).toBe(s.headings.find((h) => h.text === e.text)!.page);
    expect(s.entries[0]!.page).toBe('1'); // clean front matter: the body starts at 1
    expect(new Set(s.entries.map((e) => e.level))).toEqual(new Set(['2', '3'])); // the h4s are below max_level 3
    expect((await integrity(page, text)).problems).toEqual([]);
    await page.context().close();
  });

  it('[R.8] a heading Paged.js splits across pages is listed once, with the page it starts on', async () => {
    const long = `## ${Array.from({ length: 60 }, (_, i) => `Longheading${i}`).join(' ')}\n\n**[LONG]** ${S}\n\n`;
    const text = tocDoc(3, { extra: `${Array.from({ length: 6 }, (_, i) => `**[F${i}]** ${S} ${S} ${S}\n\n`).join('')}${long}` });
    const page = await open('tocsplit.paged.html', text);
    const s = await shown(page);
    const frags = s.headings.filter((h) => h.text.startsWith('Longheading0') || /Longheading5\d$/.test(h.text));
    expect(s.headings.some((h) => h.split), 'the long heading is split by Paged.js').toBe(true);
    const listed = s.entries.filter((e) => e.text.startsWith('Longheading0'));
    expect(listed.length).toBe(1);
    expect(listed[0]!.page).toBe(frags[0]!.page);
    await page.context().close();
  });
});
