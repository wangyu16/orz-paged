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
 * - **stranded headers** (`HEADONLY`): a table fragment holding its header
 *   row and no body row;
 * - **grid breaks** (`PJSBREAK`): a top-level `.cols` Paged.js split itself
 *   (the column handler did not: column 2 flows under column 1) — unless the
 *   handler laid it out as plain flow (`data-cols-linear`, its fallback);
 * - **continuations flush** (`FLUSH`): every column of a continued block
 *   starts at the top of its cell (its first block keeps no top margin);
 * - **the move threshold** (`MOVEGAP`): a short `.cols` block the handler
 *   moved whole to the next page left less than `MOVE_WHOLE_MAX_EMPTY` (a
 *   third) of its page empty (owner decision, round 3);
 * - **code** (`CODE`): every `pre` whole across its page fragments, every
 *   character in order WITH its whitespace — line breaks and indentation
 *   (the text check above ignores whitespace; closed loop round 3: a
 *   highlighted fence lost its newlines on continuation pages).
 *
 * Caveat (closed loop round 3): fixtures must not be periodic text (one
 * sentence repeated). Paged.js 0.4.3 finds where a page's last text node
 * continues by searching the source text for the rendered rest
 * (`createBreakToken`: `indexOf`), so in periodic text it finds an EARLIER
 * repetition, reports "Layout repeated" and stops: everything after is lost
 * — an artefact of the fixture, not of a real document (a 5-page paragraph
 * of one repeated sentence lost its following sections, closed loop round
 * 3). Periodic text also lets a lost passage and a repeated one cancel out
 * in the text check. The tags (`[T1]`: every paragraph or row tagged) catch
 * a lost block; new fixtures use non-periodic text ({@link prose}).
 *
 * Used by tests/integrity.test.ts over the column fixtures × a theme and size
 * matrix, and by scripts/columns-matrix.ts (the full matrix).
 */
import type { Page } from 'playwright-core';
import { MOVE_WHOLE_MAX_EMPTY } from '../src/paged/cols-flow.js';

export interface Integrity {
  pages: number;
  /** Empty when the pages hold the document whole. */
  problems: string[];
}

/** The page-side check (run in the read view's page, the bundle loaded). */
export async function integrity(page: Page, text: string): Promise<Integrity> {
  await page.evaluate('window.__name = window.__name || ((f) => f)'); // tsx/esbuild helper names in evaluated functions
  return page.evaluate(async ({ text, maxEmpty }) => {
    const C = (globalThis as unknown as { OrzCarrier: { renderPreview(t: string): Promise<string> } }).OrzCarrier;
    const t = document.createElement('template');
    t.innerHTML = await C.renderPreview(text); // the content as rendered, the versions applied
    // a table's header repeated on its continuation pages (`repeat_table_header`) is added content, not the document's
    const strip = (root: ParentNode): void => { root.querySelectorAll('.orz-toc, script, style, .katex-mathml, [data-orz-repeated-head]').forEach((e) => e.remove()); };
    strip(t.content);
    const W = (el: Node): string => (el.textContent || '').replace(/\s+/g, '');
    const top = (root: ParentNode): Element[] => Array.from(root.querySelectorAll('.cols')).filter((c) => !c.parentElement!.closest('.cols'));
    const cont = (c: Element): boolean => c.hasAttribute('data-cols-cont') || c.hasAttribute('data-split-from');
    // a continuation's cells add to the block's columns: by the cell's `data-ref` when the block's earlier fragments
    // had it (Paged.js' own split of a block laid out as plain flow keeps the refs, and a fragment may hold only its
    // second column), else by position (the column handler's continuations)
    const colRefs: Map<string, number>[] = [];
    const blocksOf = (root: ParentNode, acc: string[][]): void => {
      for (const c of top(root)) {
        const kids = Array.from(c.children);
        if (c.hasAttribute('data-cols-linear')) {
          // the column handler's fallback, plain flow: each block says which column it came from
          if (!cont(c) || !acc.length) { acc.push([]); colRefs.push(new Map()); }
          const last = acc[acc.length - 1]!;
          kids.forEach((k) => { const at = Number(k.getAttribute('data-cols-from') || '0'); last[at] = (last[at] ?? '') + W(k); });
          for (let i = 0; i < last.length; i++) last[i] = last[i] ?? '';
        } else if (cont(c) && acc.length) {
          const last = acc[acc.length - 1]!;
          const refs = colRefs[colRefs.length - 1]!;
          kids.forEach((k, i) => {
            const ref = k.getAttribute('data-ref') || '';
            const at = ref && refs.has(ref) ? refs.get(ref)! : i;
            if (ref && !refs.has(ref)) refs.set(ref, at);
            last[at] = (last[at] ?? '') + W(k);
          });
        } else {
          acc.push(kids.map((k) => W(k)));
          colRefs.push(new Map(kids.map((k, i) => [k.getAttribute('data-ref') || `#${i}`, i] as [string, number])));
        }
        c.replaceWith(document.createTextNode(cont(c) ? '' : '§'));
      }
    };
    // code: each source pre, exactly (whitespace kept), against its fragments on the pages (one data-ref per pre)
    const srcCode = Array.from(t.content.querySelectorAll('pre')).filter((p) => !p.closest('.orz-toc')).map((p) => p.textContent || '');
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
      // a table fragment with its header and no body row (a header stranded at a page bottom, F5)
      content.querySelectorAll('table').forEach((tb) => {
        const head = Array.from(tb.children).some((c) => c.tagName === 'THEAD' && (c.textContent || '').trim());
        const rows = Array.from(tb.querySelectorAll(':scope > tbody > tr')).some((r) => (r.textContent || '').trim());
        if (head && !rows) problems.push(`HEADONLY p${pi + 1}`);
      });
      // the hybrid's threshold (owner decision, round 3): a short block moved whole leaves less than a third of its
      // page empty (MOVEGAP: the space below the page's last drawn content, as a share of the page area)
      if (content.querySelector('[data-cols-moved-short]')) {
        let low = ar.top;
        content.querySelectorAll('*').forEach((e) => {
          if (e.closest('[data-cols-moved-short]')) return;
          const r = e.getBoundingClientRect();
          if (r.height > 0 && r.width > 0 && getComputedStyle(e).visibility !== 'hidden') low = Math.max(low, r.bottom);
        });
        const empty = (ar.bottom - low) / ar.height;
        if (empty > maxEmpty + 0.03) problems.push(`MOVEGAP p${pi + 1} ${(empty * 100).toFixed(0)}% of the page left empty`);
      }
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
      // a block laid out as plain flow (the column handler's fallback, `data-cols-linear`) is Paged.js' to split
      if (!c.parentElement!.closest('.cols') && !c.hasAttribute('data-cols-linear')) problems.push(`PJSBREAK p${pages.indexOf(c.closest('.pagedjs_page')!) + 1} cells=${c.children.length}`);
    });
    const frags = new Map<string, string>();
    let anon = 0;
    area.querySelectorAll('.pagedjs_page_content pre').forEach((p) => {
      const k = p.getAttribute('data-ref') || `#${anon++}`;
      frags.set(k, (frags.get(k) ?? '') + (p.textContent || ''));
    });
    const outCode = [...frags.values()];
    if (outCode.length !== srcCode.length) problems.push(`CODE ${outCode.length} code blocks on the pages, ${srcCode.length} in the source`);
    srcCode.forEach((want, i) => {
      const got = outCode[i];
      if (got === undefined || got === want) return;
      const wl = want.split('\n');
      const gl = got.split('\n');
      let l = 0;
      while (l < wl.length && wl[l] === gl[l]) l++;
      problems.push(`CODE block ${i + 1} line ${l + 1}/${wl.length}: source ${JSON.stringify((wl[l] ?? '').slice(0, 30))} pages ${JSON.stringify((gl[l] ?? '').slice(0, 30))}`);
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
  }, { text, maxEmpty: MOVE_WHOLE_MAX_EMPTY });
}

const WORDS = 'alpha bravo cobalt delta ember fjord garnet harbor indigo juniper kelp lumen marrow nectar onyx pewter quartz russet sable tundra umber velvet willow xenon yarrow zephyr amber birch cedar dune'.split(' ');

/**
 * Non-periodic prose for fixtures: `n` words from a seeded generator, each
 * stretch different (no sentence repeats), so the oracle's text check
 * notices a passage lost and another repeated (see the caveat above).
 */
export function prose(seed: number, n: number): string {
  let x = (seed * 2654435761) >>> 0 || 1;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    out.push(`${WORDS[x % WORDS.length]}${i % 11 === 10 ? '.' : ''}`);
  }
  return out.join(' ');
}

/** The text with its header's theme and page size replaced. */
export function withLayout(text: string, theme: string, size: string): string {
  return text
    .replace(/^page_size:.*\n/m, '')
    .replace(/^theme:.*\n/m, '')
    .replace(/^kind: document$/m, `kind: document\ntheme: ${theme}\npage_size: ${size}`);
}
