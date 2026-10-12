/**
 * light-playful-1's ruled paper is a notebook page (claim P.9; owner decisions
 * 2026-10-09, 2026-10-11): a rich three-page document laid out by the real
 * paged runtime in real Chrome. On every page: the ruling starts at the
 * content box top with the body leading as its pitch; (a) every line of text
 * written on the lines — paragraphs, lists, headings of every level, display
 * formulas (their baseline), footnotes — sits on a rule (the rule
 * 0–3 px under its baseline); (b) every sheet attached on top — a table,
 * code, a callout, a quote (a slip clipped on), a figure, columns — is opaque and starts and ends on a
 * rule (or starts at the content box top); (c) the ruling runs on behind what
 * is on the lines: none of those blocks has a background, and the page
 * pixels between the lines of a heading and of a formula show the rule ink.
 * Screenshots of pages 1–3 go to /tmp/paged-themes/light-playful-1-aligned-p<n>.png.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync } from 'node:fs';
import { launchChrome } from './helpers.js';
import { renderPaged } from './theme-render.js';

const browser = await launchChrome();
const chrome = browser ? describe : describe.skip;
afterAll(async () => { await browser?.close(); });

const SHOTS = '/tmp/paged-themes';

const para = (n: number, words: string): string => Array.from({ length: n }, (_, i) => `${words} (${i + 1})`).join(' ');
const PICTURE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='120' viewBox='0 0 320 120'%3E%3Crect width='320' height='120' fill='%23cfe7fc'/%3E%3Cpath d='M0 95 L70 45 L130 80 L200 30 L320 90 V120 H0Z' fill='%233d6e17' fill-opacity='.55'/%3E%3Ccircle cx='260' cy='30' r='14' fill='%23fff1a1'/%3E%3C/svg%3E";

/** A rich document of about three pages: headings of every level, display formulas of one to three lines, footnotes, and sheets (a table, code, a callout, a quote, a figure, columns) between runs of text. */
export const RULED_SAMPLE = `{{nyml
kind: document
title: A Notebook Page
theme: light-playful-1
page_size: A4
font_size: 10.5
line_height: 1.6
header_right: Notebook
footer_left: orz-paged
}}

# A Notebook Page

${para(5, 'Running text sits on the ruled lines of the page, one line of writing per rule, with **bold**, *italic*, a [link](https://markdown.orz.how), `code`, ==marked== words and a note.[^1]')}

## A list between paragraphs

- The first item of a list sits on a rule
- The second item, long enough to wrap onto a second line so that the wrapped line also has to land exactly on the next rule of the page
  - a nested item
  - another nested item
- The last item

${para(4, 'After the list the text continues on the lines.')}

| Column | Value | Note |
|:--|--:|:--|
| alpha | 1 | a table is a sheet pasted on the page |
| beta | 2 | on its own paper |
| gamma | 3 | and the text after it is back on the lines |

${para(3, 'After the table the writing returns to the rules.')}

::: info
**A callout.** A sticky note on the page: its own paper, taped on.
:::

${para(4, 'After the callout the next paragraph is on the lines again.')}

:::: cols
::: col
${para(3, 'Left column text.')}
:::
::: col
${para(3, 'Right column text.')}
:::
::::

### Code and math

\`\`\`js
function area(r) {
  return Math.PI * r ** 2;
}
\`\`\`

${para(3, 'Inline math $a^2 + b^2 = c^2$ stays on the line.')}

$$E = mc^2$$

${para(2, 'A fraction is taller than a line.')}

$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$

${para(2, 'A tall formula spans several lines.')}

$$\\sum_{k=1}^{n} \\frac{1}{k^2} = \\cfrac{\\pi^2}{6 + \\cfrac{1}{1 + \\cfrac{1}{2}}}$$

${para(4, 'After the display formulas the text is back on the lines.')}

> A quotation is a slip of paper clipped onto the page, written in the theme's hand and slightly tilted. It runs over two lines of the slip.

${para(2, 'After the quote the text goes on.')}

<figure><img src="${PICTURE}" alt="Hills under a sun"><figcaption>A figure is a picture pasted in, with its caption.</figcaption></figure>

${para(3, 'After the figure the text is on the lines.')}

1. A numbered list
2. With a second item
3. And a third one

---

#### A fourth-level heading

${para(3, 'Text under a small heading.')}

##### A fifth-level heading

${para(2, 'More text.')}

###### A sixth-level heading

${para(12, 'The last paragraph runs on to the next page and keeps to the lines there too.')}

[^1]: A footnote at the end.
`;

/** Blocks written on the lines (the rest are sheets on top). */
const ON_LINES = String.raw`^(P|UL|OL|H[1-6]|HR)$`;

/** On every page of a rendered document: the ruling's start and pitch; each written line against its rule; the sheets' edges; backgrounds. */
async function gridReport(r: Awaited<ReturnType<typeof renderPaged>>) {
  return r.page.evaluate((onLines) => {
    type Line = { d: number; text: string };
    const out: { page: number; grid: number; ruleAt: number; beforeTop: number; lines: Line[]; offGrid: string[]; transparent: string[]; opaqueLined: string[]; sheets: Array<{ what: string; top: number; bottom: number; opaque: boolean; atTop: boolean; fragment: boolean }>; ruledBlocks: number; kinds: string[] }[] = [];
    const all = Array.from(document.querySelectorAll<HTMLElement>('.pagedjs_page'));
    const opaque = (bg: string): boolean => /^rgb\(/.test(bg) || /^rgba\([^)]*,\s*1\)$/.test(bg);
    const clear = (bg: string): boolean => bg === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(bg);
    const untransformed = (el: HTMLElement): DOMRect => {
      const cs = getComputedStyle(el);
      const dy = cs.position === 'relative' ? parseFloat(cs.top) || 0 : 0;
      const t = el.style.getPropertyValue('transform');
      el.style.setProperty('transform', 'none', 'important');
      const rr = el.getBoundingClientRect();
      if (t) el.style.setProperty('transform', t); else el.style.removeProperty('transform');
      return new DOMRect(rr.x, rr.y - dy, rr.width, rr.height);
    };
    const mark = (): HTMLElement => {
      const m = document.createElement('span');
      m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      return m;
    };
    all.forEach((pg, n) => {
      const area = pg.querySelector<HTMLElement>('.pagedjs_area')!;
      const at = area.getBoundingClientRect();
      // the pitch, independently: a box of height var(--orz-grid) in the area
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;height:var(--orz-grid);width:0';
      area.appendChild(probe);
      const grid = probe.getBoundingClientRect().height;
      probe.remove();
      const ruleAt = parseFloat(getComputedStyle(pg).getPropertyValue('--orz-rule-at'));
      const onRule = (y: number): boolean => Math.abs(y - (ruleAt + Math.round((y - ruleAt) / grid) * grid)) <= 1;
      // the ruling is the page box's ::before (never a positioned .pagedjs_area): it starts at the content box top
      const box = pg.querySelector<HTMLElement>('.pagedjs_pagebox')!;
      const before = getComputedStyle(box, '::before');
      const beforeTop = parseFloat(before.top) - (at.top - box.getBoundingClientRect().top);
      const body = pg.querySelector<HTMLElement>('.markdown-body');
      const lines: Line[] = [];
      if (getComputedStyle(area).position !== 'static') lines.push({ d: -99, text: 'the page area is positioned' });
      const offGrid: string[] = [];
      const transparent: string[] = [];
      const opaqueLined: string[] = [];
      const sheets: Array<{ what: string; top: number; bottom: number; opaque: boolean; atTop: boolean; fragment: boolean }> = [];
      const kinds: string[] = [];
      let ruledBlocks = 0;
      const blocks = (body ? Array.from(body.children) as HTMLElement[] : []).filter((el) => getComputedStyle(el).display !== 'none' && getComputedStyle(el).position !== 'absolute');
      const sample = (el: HTMLElement): void => {
        // the first character of each written line (text set in the block, its list items, paragraphs, quotes; not
        // code, math, marks or footnote numbers); its baseline: its glyph box less the font's descent, measured once
        // per element on a hidden, absolutely positioned probe in the same face (out of the flow: nothing moves)
        const descent = new Map<Element, number>();
        const descentOf = (host: HTMLElement): number => {
          if (!descent.has(host)) {
            const pr = document.createElement('span');
            pr.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;visibility:hidden';
            const m = mark();
            const x = document.createTextNode('x');
            pr.append(m, x);
            host.appendChild(pr);
            const g = document.createRange();
            g.selectNodeContents(x);
            descent.set(host, g.getBoundingClientRect().bottom - m.getBoundingClientRect().bottom);
            pr.remove();
          }
          return descent.get(host)!;
        };
        let last = -Infinity;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
          const host = t.parentElement!;
          if (host.closest('code, pre, .katex, sup, sub, svg, .footnote-backref, a.footnote-ref')) continue;
          for (let i = 0; i < t.length; i++) {
            if (!/\S/.test(t.data[i])) continue;
            const range = document.createRange();
            range.setStart(t, i);
            range.setEnd(t, i + 1);
            const rect = range.getClientRects()[0];
            if (!rect || rect.top <= last + grid / 2) continue;
            last = rect.top;
            const baseline = rect.bottom - descentOf(host) - at.top;
            const k = Math.round((baseline - ruleAt) / grid);
            lines.push({ d: ruleAt + k * grid - baseline, text: `${el.tagName}: ${t.data.slice(i, i + 24)}` });
          }
        }
      };
      for (const el of blocks) {
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor;
        const isMath = el.tagName === 'P' && !!el.querySelector('.katex-display');
        const isPicture = el.tagName === 'P' && el.children.length === 1 && el.children[0].tagName === 'IMG' && !(el.textContent || '').trim();
        const lined = (new RegExp(onLines).test(el.tagName) && !isPicture && !el.classList.contains('toc-list')) || (el.tagName === 'SECTION' && el.classList.contains('footnotes'));
        if (el.classList.contains('orz-off-grid')) { offGrid.push(el.tagName); continue; }
        if (!lined) {
          // a sheet (columns: each column is one)
          const fragment = Array.from(el.attributes).some((a) => /^data-(split|cols)/.test(a.name));
          for (const s of el.classList.contains('cols') ? Array.from(el.children) as HTMLElement[] : [el]) {
            const rr = untransformed(s);
            sheets.push({ what: `${s.tagName}.${s.className}`, top: rr.top - at.top, bottom: rr.bottom - at.top, opaque: opaque(getComputedStyle(s).backgroundColor), atTop: Math.abs(rr.top - at.top) <= 1, fragment });
            kinds.push(`sheet:${s.tagName}`);
          }
          continue;
        }
        kinds.push(isMath ? 'math' : el.tagName);
        if (!clear(bg)) transparent.push(`${el.tagName}.${el.className} ${bg}`);
        if (cs.backgroundImage !== 'none' && el.tagName !== 'HR') opaqueLined.push(`${el.tagName} ${cs.backgroundImage.slice(0, 40)}`);
        ruledBlocks++;
        if (isMath) {
          const html = el.querySelector<HTMLElement>('.katex-display > .katex > .katex-html')!;
          const m = mark();
          html.insertBefore(m, html.firstChild);
          const baseline = m.getBoundingClientRect().bottom - at.top;
          m.remove();
          const k = Math.round((baseline - ruleAt) / grid);
          lines.push({ d: ruleAt + k * grid - baseline, text: `math: ${(el.textContent || '').slice(0, 20)}` });
          continue;
        }
        if (el.tagName !== 'HR') sample(el);
      }
      out.push({ page: n + 1, grid, ruleAt, beforeTop, lines, offGrid, transparent, opaqueLined, sheets: sheets.map((x) => ({ ...x, top: x.top, bottom: x.bottom })), ruledBlocks, kinds });
      void onRule;
    });
    return out;
  }, ON_LINES);
}

function expectOnGrid(r: Awaited<ReturnType<typeof renderPaged>>, report: Awaited<ReturnType<typeof gridReport>>, o: { offGrid?: boolean; sheets?: boolean } = {}): number {
  let sampled = 0;
  const onRule = (y: number, p: { grid: number; ruleAt: number }): number => y - (p.ruleAt + Math.round((y - p.ruleAt) / p.grid) * p.grid);
  for (const p of report) {
    expect(p.grid, `page ${p.page}`).toBeCloseTo(r.grid.grid, 1);
    expect(p.ruleAt, `page ${p.page}: --orz-rule-at`).toBeCloseTo(r.grid.ruleAt, 1);
    expect(Math.abs(p.beforeTop), `page ${p.page}: the ruling starts at the content box top`).toBeLessThan(0.5);
    // (c) the ruling runs on behind what is written on the lines
    expect(p.transparent, `page ${p.page}: blocks on the lines have no background`).toEqual([]);
    expect(p.opaqueLined, `page ${p.page}: blocks on the lines have no background image`).toEqual([]);
    if (!o.offGrid) expect(p.offGrid, `page ${p.page}: no written block left the grid`).toEqual([]);
    // (a) every written line on its rule
    for (const l of p.lines) {
      // the rule is just under the baseline: never above it, at most ~3 px below
      expect(l.d, `page ${p.page}: "${l.text}" sits ${l.d.toFixed(2)} px above its rule`).toBeGreaterThanOrEqual(-0.5);
      expect(l.d, `page ${p.page}: "${l.text}" sits ${l.d.toFixed(2)} px above its rule`).toBeLessThanOrEqual(3);
    }
    // (b) the sheets: opaque, from a rule (or the content box top) to a rule
    if (o.sheets !== false) {
      for (const s of p.sheets) {
        expect(s.opaque, `page ${p.page}: ${s.what} is opaque`).toBe(true);
        if (s.fragment) continue;
        expect(s.atTop || Math.abs(onRule(s.top, p)) <= 1, `page ${p.page}: ${s.what} starts on a rule (${s.top.toFixed(1)})`).toBe(true);
        expect(Math.abs(onRule(s.bottom, p)), `page ${p.page}: ${s.what} ends on a rule (${s.bottom.toFixed(1)})`).toBeLessThanOrEqual(1);
      }
    }
    sampled += p.lines.length;
  }
  return sampled;
}

/** (c) by pixels: in each rendered page, the rules that run through a two-line heading's box and a display formula's box show the rule ink at the right end of the text column (no glyphs there): the ruling is not covered. */
async function ruleInkBehind(r: Awaited<ReturnType<typeof renderPaged>>): Promise<string[]> {
  const bad: string[] = [];
  const pages = r.page.locator('.pagedjs_page');
  const count = await pages.count();
  for (let n = 0; n < count; n++) {
    const spots = await pages.nth(n).evaluate((pg) => {
      const res: Array<{ x: number; y: number; what: string }> = [];
      const area = pg.querySelector<HTMLElement>('.pagedjs_area')!;
      const at = area.getBoundingClientRect();
      const pr = pg.getBoundingClientRect();
      const ruleAt = parseFloat(getComputedStyle(pg).getPropertyValue('--orz-rule-at'));
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;height:var(--orz-grid);width:0';
      area.appendChild(probe);
      const g = probe.getBoundingClientRect().height;
      probe.remove();
      for (const el of Array.from(pg.querySelectorAll<HTMLElement>('.markdown-body > h1, .markdown-body > h2, .markdown-body > p.katex-block'))) {
        const rr = el.getBoundingClientRect();
        for (let y = at.top + ruleAt + Math.ceil((rr.top - at.top - ruleAt) / g) * g; y < rr.bottom - 1; y += g) {
          res.push({ x: at.right - 3 - pr.left, y: y - 0.5 - pr.top, what: `${el.tagName} p${(Array.from(document.querySelectorAll('.pagedjs_page')).indexOf(pg)) + 1} y=${(y - at.top).toFixed(1)}` });
        }
      }
      return res;
    });
    if (!spots.length) continue;
    const png = await pages.nth(n).screenshot({ type: 'png' });
    const misses = await r.page.evaluate(async ({ b64, spots }) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const scale = window.devicePixelRatio || 1;
      const out: string[] = [];
      for (const s of spots) {
        const d = g.getImageData(Math.round(s.x * scale), Math.round(s.y * scale) - 3, 1, 7).data;
        let found = false;
        // the rule ink (a light blue over the cream paper): blue clearly above red
        for (let i = 0; i < d.length; i += 4) if (d[i + 2] - d[i] >= 12) found = true;
        if (!found) out.push(s.what);
      }
      return out;
    }, { b64: png.toString('base64'), spots });
    bad.push(...misses);
  }
  return bad;
}

chrome('light-playful-1: a ruled notebook page (real Chrome, the paged runtime)', () => {
  it('[P.9] on every page what is written sits on the rules (text, lists, headings of every level, display formulas, footnotes) and the ruling runs on behind it; sheets (a table, code, a callout, a quote, a figure, columns) are opaque and start and end on a rule', async () => {
    const r = await renderPaged(browser!, RULED_SAMPLE, { scale: 1.5 });
    try {
      expect(r.errors).toEqual([]);
      expect(r.pages).toBeGreaterThanOrEqual(3);
      expect(r.grid.grid).toBeGreaterThan(10); // 10.5pt x 1.6 = 22.4px
      expect(Math.abs(r.grid.grid - 10.5 * 1.6 * 96 / 72)).toBeLessThan(0.05);

      mkdirSync(SHOTS, { recursive: true });
      const pages = r.page.locator('.pagedjs_page');
      for (let i = 0; i < 3; i++) await pages.nth(i).screenshot({ path: `${SHOTS}/light-playful-1-aligned-p${i + 1}.png` });

      const report = await gridReport(r);
      const sampled = expectOnGrid(r, report);
      const kinds = report.flatMap((p) => p.kinds);
      // every kind was laid out and checked
      for (const k of ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'UL', 'OL', 'SECTION', 'math', 'sheet:TABLE', 'sheet:PRE', 'sheet:DIV', 'sheet:BLOCKQUOTE', 'sheet:FIGURE']) expect(kinds, k).toContain(k);
      expect(kinds.filter((k) => k === 'math').length).toBe(3);
      const lines = report.flatMap((p) => p.lines);
      for (const w of ['H1:', 'H2:', 'H3:', 'H4:', 'H5:', 'H6:', 'SECTION:', 'math:']) expect(lines.some((l) => l.text.startsWith(w)), `${w} sampled`).toBe(true);
      expect(report.slice(0, 3).every((p) => p.lines.length >= 5), JSON.stringify(report.map((p) => p.lines.length))).toBe(true);
      expect(sampled).toBeGreaterThan(40);
      expect(await ruleInkBehind(r), 'the ruling shows behind headings and formulas').toEqual([]);
    } finally {
      await r.page.close();
    }
  }, 120_000);

  it('[P.9] a quote (a tilted slip clipped on: a sheet), then a paragraph that runs over the page bottom: every line of text is inside its page and the paragraph continues on the next page (Letter 11/1.5, A5 12/1.5, Letter 9/2; closed loop round 1 — a positioned page area clipped it)', async () => {
    const tail = Array.from({ length: 90 }, (_, i) => `Tail sentence goes on and on [T${i + 1}]`).join(' ');
    const lead = Array.from({ length: 6 }, (_, i) => `Running text on the lines with words [R${i + 1}].`).join(' ');
    const bodies = {
      'quote-first': `# Notes\n\n> A short quote.\n\n${lead}\n\n${lead}\n\n${tail}\n`,
      'quote-between': `# Notes\n\n${lead}\n\n> A short quote.\n\n${tail}\n`,
    };
    const results: string[] = [];
    for (const [size, fs, lh] of [['Letter', '11', '1.5'], ['A5', '12', '1.5'], ['Letter', '9', '2']]) {
      for (const [name, body] of Object.entries(bodies)) {
        const text = `{{nyml\nkind: document\ntheme: light-playful-1\npage_size: ${size}\nfont_size: ${fs}\nline_height: ${lh}\n}}\n\n${body}`;
        const r = await renderPaged(browser!, text, { scale: 1 });
        try {
          const id = `${size} ${fs}/${lh} ${name}`;
          expect(r.errors, id).toEqual([]);
          const out = await r.page.evaluate(() => {
            const pages = Array.from(document.querySelectorAll<HTMLElement>('.pagedjs_page'));
            const tags: string[] = [];
            const outside: string[] = [];
            pages.forEach((p, pi) => {
              const content = p.querySelector('.pagedjs_page_content')!;
              // the page's content box: from the top margin's bottom to the bottom margin's top (the area or the content
              // element may grow past it; the page clips there)
              // (and between the side margins: Paged.js' overflow lands in an off-page column to the right)
              const c = { top: p.querySelector('.pagedjs_margin-top')!.getBoundingClientRect().bottom, bottom: p.querySelector('.pagedjs_margin-bottom')!.getBoundingClientRect().top, left: p.querySelector('.pagedjs_margin-left')!.getBoundingClientRect().right, right: p.querySelector('.pagedjs_margin-right')!.getBoundingClientRect().left };
              const w = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
              for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
                for (const m of n.data.matchAll(/\[([A-Z]\d+)\]/g)) {
                  const rg = document.createRange();
                  rg.setStart(n, m.index!);
                  rg.setEnd(n, m.index! + m[0].length);
                  const rr = rg.getBoundingClientRect();
                  tags.push(m[1]);
                  if (rr.height === 0 || rr.bottom > c.bottom + 1 || rr.top < c.top - 1 || rr.left < c.left - 1 || rr.right > c.right + 1) outside.push(`p${pi + 1}:${m[1]}`);
                }
              }
            });
            return { pages: pages.length, tags, outside };
          });
          const want = [...text.matchAll(/\[([A-Z]\d+)\]/g)].map((m) => m[1]);
          expect(out.tags, `${id}: every tag once, in order`).toEqual(want);
          expect(out.outside, `${id}: lines outside their page`).toEqual([]);
          expect(out.pages, `${id}: the paragraph continues on a next page`).toBeGreaterThanOrEqual(2);
          results.push(`${id}: ${out.pages} pages`);
        } finally {
          await r.page.close();
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('[P.9] quote then a page-spanning paragraph:', results.join('; '));
  }, 240_000);

  it('[P.9] after blocks that leave the grid (lists holding code, a quote or a task; `orz-off-grid`) the running text is back on the rules — also a paragraph that runs over the page bottom (closed loop round 1, F3: its first fragment is where it starts), Letter 9/2', async () => {
    const p = (n: number, w: string): string => Array.from({ length: n }, (_, i) => `${w} (${i + 1})`).join(' ');
    const text = `{{nyml\nkind: document\ntheme: light-playful-1\npage_size: Letter\nfont_size: 9\nline_height: 2\n}}\n\n# Notebook\n\n${p(6, 'Running text on the lines with words.')}\n\n- loose item one ${p(2, 'wrap wrap wrap')}\n\n- loose item two\n\n  \`\`\`\n  code inside an item\n  more code\n  \`\`\`\n\n- loose item three ${p(2, 'after code')}\n\n${p(5, 'Back to the lines.')}\n\n- [ ] a task item\n- [x] a done task ${p(2, 'task text')}\n\n${p(4, 'Text with H~2~O and x^2^ and a sup.')}\n\n1. one\n   > quoted inside an item\n2. two ${p(2, 'more')}\n\n${p(14, 'The long tail paragraph keeps to the lines across the page break.')}\n`;
    const r = await renderPaged(browser!, text, { scale: 1 });
    try {
      expect(r.errors).toEqual([]);
      expect(r.pages).toBe(2);
      const report = await gridReport(r);
      expect(report[0]!.offGrid.length).toBeGreaterThan(0); // the lists holding code, a task and a quote
      expect(expectOnGrid(r, report, { offGrid: true })).toBeGreaterThan(10);
      expect(report[1]!.lines.length).toBeGreaterThan(0); // the tail continues on page 2, on the lines
    } finally {
      await r.page.close();
    }
  }, 120_000);
});
