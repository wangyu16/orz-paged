/**
 * light-playful-1's ruled paper follows the text (claim P.9; owner decision
 * 2026-10-09): a rich three-page document laid out by the real paged runtime
 * in real Chrome; on every page, sampled lines of running text sit on a rule
 * (the baseline just above it), the ruling starts at the content box top with
 * the body leading as its pitch, and every block that is not running text
 * hides the ruling behind an opaque background. Screenshots of pages 1–3 go
 * to /tmp/paged-themes/light-playful-1-aligned-p<n>.png.
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

/** A rich document of about three pages: every kind of block between runs of text. */
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

${para(8, 'Running text sits on the ruled lines of the page, one line of writing per rule, with **bold**, *italic*, a [link](https://markdown.orz.how), `code`, ==marked== words and a note.[^1]')}

## A list between paragraphs

- The first item of a list sits on a rule
- The second item, long enough to wrap onto a second line so that the wrapped line also has to land exactly on the next rule of the page
  - a nested item
  - another nested item
- The last item

${para(5, 'After the list the text continues on the lines.')}

| Column | Value | Note |
|:--|--:|:--|
| alpha | 1 | a table hides the rules |
| beta | 2 | behind its own paper |
| gamma | 3 | and the text after it is back on the grid |

${para(4, 'After the table the writing returns to the rules.')}

::: info
**A callout.** Its tinted paper hides the ruling; its own height does not matter.
:::

${para(5, 'After the callout the next paragraph is on the grid again.')}

### Code and math

\`\`\`js
function area(r) {
  return Math.PI * r ** 2;
}
\`\`\`

${para(3, 'Inline math $a^2 + b^2 = c^2$ stays on the line.')}

$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$

${para(6, 'After the display formula the text is back on the lines.')}

> A quotation sits on its own slip of paper, the ruling hidden behind it.

:::: cols
::: col
${para(3, 'Left column text.')}
:::
::: col
${para(3, 'Right column text.')}
:::
::::

1. A numbered list
2. With a second item
3. And a third one

---

#### A small heading

${para(12, 'The last paragraph runs on to the next page and keeps to the lines there too.')}

[^1]: A footnote at the end.
`;

/** On every page of a rendered document: the ruling's start and pitch, every sampled running-text line on its rule, other blocks opaque. */
async function gridReport(r: Awaited<ReturnType<typeof renderPaged>>) {
  return r.page.evaluate(() => {
    const out: { page: number; grid: number; ruleAt: number; beforeTop: number; lines: Array<{ d: number; text: string }>; offGrid: string[]; transparent: string[]; ruledBlocks: number }[] = [];
    const all = Array.from(document.querySelectorAll<HTMLElement>('.pagedjs_page'));
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
      // the ruling is the page box's ::before (never a positioned .pagedjs_area): it starts at the content box top
      const box = pg.querySelector<HTMLElement>('.pagedjs_pagebox')!;
      const before = getComputedStyle(box, '::before');
      const beforeTop = parseFloat(before.top) - (at.top - box.getBoundingClientRect().top);
      const body = pg.querySelector<HTMLElement>('.markdown-body');
      const lines: Array<{ d: number; text: string }> = [];
      if (getComputedStyle(area).position !== 'static') lines.push({ d: -99, text: 'the page area is positioned' });
      const offGrid: string[] = [];
      const transparent: string[] = [];
      let ruledBlocks = 0;
      const blocks = body ? Array.from(body.children) as HTMLElement[] : [];
      for (const el of blocks) {
        const ruled = /^(P|UL|OL)$/.test(el.tagName) && !el.classList.contains('toc-list') && !el.classList.contains('katex-block') && !el.querySelector('.katex-display') && !(el.tagName === 'P' && el.children.length === 1 && el.children[0].tagName === 'IMG' && !(el.textContent || '').trim());
        const bg = getComputedStyle(el).backgroundColor;
        if (!ruled || el.classList.contains('orz-off-grid')) {
          if (el.classList.contains('orz-off-grid')) offGrid.push(el.tagName);
          if (!/^rgb\(/.test(bg) && !/^rgba\([^)]*,\s*1\)$/.test(bg)) transparent.push(`${el.tagName}.${el.className} ${bg}`);
          continue;
        }
        ruledBlocks++;
        // the first character of each line, in text set directly in the block (or a list item): the body font
        const starts: Array<[Text, number, DOMRect]> = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let last = -Infinity;
        for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
          if (t.parentElement !== el && t.parentElement?.tagName !== 'LI' && !(t.parentElement?.tagName === 'P' && t.parentElement.parentElement?.tagName === 'LI')) continue;
          for (let i = 0; i < t.length; i++) {
            if (!/\S/.test(t.data[i])) continue;
            const range = document.createRange();
            range.setStart(t, i);
            range.setEnd(t, i + 1);
            const rect = range.getClientRects()[0];
            if (!rect) continue;
            if (rect.top > last + grid / 2) { starts.push([t, i, rect]); last = rect.top; }
          }
        }
        if (starts.length === 0) continue;
        // a glyph's box is the font's ascent + descent around the baseline: measure the descent once, with a
        // zero-size inline box right before the block's first character (at the block start: no wrap changes)
        const [t0, i0, r0] = starts[0];
        const mark = document.createElement('span');
        mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        const rest = i0 > 0 ? t0.splitText(i0) : t0;
        rest.parentNode!.insertBefore(mark, rest);
        const descent = r0.bottom - mark.getBoundingClientRect().bottom;
        mark.remove();
        for (const [t, i, rect] of starts) {
          const baseline = rect.bottom - descent - at.top;
          // the nearest rule: rules at ruleAt + k * grid from the area top
          const k = Math.round((baseline - ruleAt) / grid);
          lines.push({ d: ruleAt + k * grid - baseline, text: t.data.slice(i, i + 24) });
        }
      }
      out.push({ page: n + 1, grid, ruleAt, beforeTop, lines, offGrid, transparent, ruledBlocks });
    });
    return out;
  });

}

function expectOnGrid(r: Awaited<ReturnType<typeof renderPaged>>, report: Awaited<ReturnType<typeof gridReport>>, o: { offGrid?: boolean } = {}): number {
  let sampled = 0;
  for (const p of report) {
    expect(p.grid, `page ${p.page}`).toBeCloseTo(r.grid.grid, 1);
    expect(p.ruleAt, `page ${p.page}: --orz-rule-at`).toBeCloseTo(r.grid.ruleAt, 1);
    expect(Math.abs(p.beforeTop), `page ${p.page}: the ruling starts at the content box top`).toBeLessThan(0.5);
    expect(p.transparent, `page ${p.page}: blocks that are not running text hide the ruling`).toEqual([]);
    if (!o.offGrid) expect(p.offGrid, `page ${p.page}: no running text left the grid`).toEqual([]);
    for (const l of p.lines) {
      // the rule is just under the baseline: never above it, at most ~3 px below
      expect(l.d, `page ${p.page}: "${l.text}" sits ${l.d.toFixed(2)} px above its rule`).toBeGreaterThanOrEqual(-0.5);
      expect(l.d, `page ${p.page}: "${l.text}" sits ${l.d.toFixed(2)} px above its rule`).toBeLessThanOrEqual(3);
    }
    sampled += p.lines.length;
  }
  return sampled;
}

chrome('light-playful-1: the ruling follows the text (real Chrome, the paged runtime)', () => {
  it('[P.9] on every page the running text sits on the rules; other blocks hide the ruling', async () => {
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
      expect(report.slice(0, 3).every((p) => p.lines.length >= 5), JSON.stringify(report.map((p) => p.lines.length))).toBe(true);
      expect(sampled).toBeGreaterThan(40);
    } finally {
      await r.page.close();
    }
  }, 120_000);

  it('[P.9] a quote, then a paragraph that runs over the page bottom: every line of text is inside its page and the paragraph continues on the next page (Letter 11/1.5, A5 12/1.5, Letter 9/2; closed loop round 1 — a positioned page area clipped it)', async () => {
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
