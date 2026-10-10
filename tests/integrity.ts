/**
 * The whole-document integrity oracle (closed loop round 2: the adversaries'
 * check, made reusable): a laid-out read view against the document's own
 * rendering, page-side in real Chrome.
 *
 * - **text**: every non-space character of the content, in order (the TOC,
 *   scripts, styles and KaTeX's MathML excluded), and — per top-level `.cols`
 *   block — every column's characters across all its pages (a continuation,
 *   `data-cols-cont` or Paged.js' own `data-split-from`, adds to the block
 *   before it);
 * - **tags**: the multiset of `[Tag]` markers (fixtures tag every paragraph):
 *   nothing lost, nothing repeated;
 * - **clipping**: no text block ends below its page's area (`CLIP`), none sits
 *   in Paged.js' hidden off-page column (`HIDDENCOL`);
 * - **blank pages** (`BLANK`): a page with no text and no image;
 * - **grid breaks** (`PJSBREAK`): a top-level `.cols` Paged.js split itself
 *   (the column handler did not: column 2 flows under column 1);
 * - **continuations flush** (`FLUSH`): every column of a continued block
 *   starts at the top of its cell (its first block keeps no top margin).
 *
 * Used by tests/integrity.test.ts over the column fixtures × a theme and size
 * matrix, and by scripts/columns-matrix.ts (the full matrix).
 */
import type { Page } from 'playwright-core';

export interface Integrity {
  pages: number;
  /** Empty when the pages hold the document whole. */
  problems: string[];
}

/** The page-side check (run in the read view's page, the bundle loaded). */
export async function integrity(page: Page, text: string): Promise<Integrity> {
  await page.evaluate('window.__name = window.__name || ((f) => f)'); // tsx/esbuild helper names in evaluated functions
  return page.evaluate(async (text) => {
    const C = (globalThis as unknown as { OrzCarrier: { renderPreview(t: string): Promise<string> } }).OrzCarrier;
    const t = document.createElement('template');
    t.innerHTML = await C.renderPreview(text); // the content as rendered, the versions applied
    const strip = (root: ParentNode): void => { root.querySelectorAll('.orz-toc, script, style, .katex-mathml').forEach((e) => e.remove()); };
    strip(t.content);
    const W = (el: Node): string => (el.textContent || '').replace(/\s+/g, '');
    const top = (root: ParentNode): Element[] => Array.from(root.querySelectorAll('.cols')).filter((c) => !c.parentElement!.closest('.cols'));
    const cont = (c: Element): boolean => c.hasAttribute('data-cols-cont') || c.hasAttribute('data-split-from');
    const blocksOf = (root: ParentNode, acc: string[][]): void => {
      for (const c of top(root)) {
        const cells = Array.from(c.children).map((k) => W(k));
        if (cont(c) && acc.length) {
          const last = acc[acc.length - 1]!;
          cells.forEach((w, i) => { last[i] = (last[i] ?? '') + w; });
        } else acc.push(cells);
        c.replaceWith(document.createTextNode(cont(c) ? '' : '§'));
      }
    };
    const tagsOf = (s: string): string[] => (s.match(/\[[A-Za-z][A-Za-z0-9]*\]/g) || []).sort();
    const srcTags = tagsOf(t.content.textContent || '');
    const srcBlocks: string[][] = [];
    blocksOf(t.content, srcBlocks);
    const src = `${W(t.content)}|${srcBlocks.map((b) => b.join('#')).join('/')}`;

    const area = document.getElementById('orz-pages')!;
    const pages = Array.from(area.querySelectorAll('.pagedjs_page'));
    const problems: string[] = [];
    const outBlocks: string[][] = [];
    let flat = '';
    let outText = '';
    pages.forEach((p, pi) => {
      const content = p.querySelector('.pagedjs_page_content')!;
      const copy = content.cloneNode(true) as HTMLElement;
      strip(copy);
      outText += ` ${copy.textContent || ''}`;
      blocksOf(copy, outBlocks);
      flat += W(copy);
      const ar = (p.querySelector('.pagedjs_area') || content).getBoundingClientRect();
      content.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, .col > *').forEach((e) => {
        if (e.closest('[data-cols-placeholder], .orz-toc')) return;
        const r = e.getBoundingClientRect();
        if (r.height === 0 || !(e.textContent || '').trim()) return;
        const rg = document.createRange();
        rg.selectNodeContents(e);
        const rs = Array.from(rg.getClientRects()).filter((x) => x.height > 0);
        const lb = rs.length ? Math.max(...rs.map((x) => x.bottom)) : r.bottom;
        const what = `p${pi + 1} ${e.tagName} "${(e.textContent || '').trim().slice(0, 25)}"`;
        if (r.left >= ar.right - 1 && r.width > 0) problems.push(`HIDDENCOL ${what}`);
        else if (lb > ar.bottom + 1.5) problems.push(`CLIP ${what} +${(lb - ar.bottom).toFixed(1)}`);
      });
      if (!(content.textContent || '').trim() && !content.querySelector('img, svg')) problems.push(`BLANK p${pi + 1}`);
      // a block's continuation starts flush with the top of every column (FLUSH: its first block keeps no top margin)
      for (const c of top(content)) {
        if (!c.hasAttribute('data-cols-cont') || getComputedStyle(c).display === 'none') continue;
        Array.from(c.children).forEach((cell, i) => {
          const f = cell.firstElementChild;
          if (!f || cell.hasAttribute('data-cols-placeholder')) return;
          const m = parseFloat(getComputedStyle(f).marginTop) || 0;
          if (m > 0.5) problems.push(`FLUSH p${pi + 1} column ${i + 1} margin ${m.toFixed(1)}`);
        });
      }
    });
    area.querySelectorAll('.cols[data-split-from]').forEach((c) => {
      if (!c.parentElement!.closest('.cols')) problems.push(`PJSBREAK p${pages.indexOf(c.closest('.pagedjs_page')!) + 1} cells=${c.children.length}`);
    });
    const outTags = tagsOf(outText);
    if (srcTags.join('') !== outTags.join('')) {
      const b = [...outTags];
      const missing = srcTags.filter((x) => { const i = b.indexOf(x); if (i >= 0) { b.splice(i, 1); return false; } return true; });
      problems.unshift(`TAGS missing ${missing.join('')} extra ${b.join('')}`);
    }
    const out = `${flat}|${outBlocks.map((b) => b.join('#')).join('/')}`;
    if (src !== out) {
      let k = 0;
      while (k < src.length && src[k] === out[k]) k++;
      problems.unshift(`TEXT differs at ${k}/${src.length}: source "${src.slice(k, k + 40)}" pages "${out.slice(k, k + 40)}"`);
    }
    return { pages: pages.length, problems };
  }, text);
}

/** The text with its header's theme and page size replaced. */
export function withLayout(text: string, theme: string, size: string): string {
  return text
    .replace(/^page_size:.*\n/m, '')
    .replace(/^theme:.*\n/m, '')
    .replace(/^kind: document$/m, `kind: document\ntheme: ${theme}\npage_size: ${size}`);
}
