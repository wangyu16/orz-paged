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
 *   row and no body row; **repeated headers** (`REPEAT`): a table's
 *   continuation repeats its header exactly when the page CSS asks
 *   (`--orz-repeat-thead: 1`, `repeat_table_header`);
 * - **grid breaks** (`PJSBREAK`): a top-level `.cols` Paged.js split itself
 *   (the column handler did not: column 2 flows under column 1) — unless the
 *   handler laid it out as plain flow (`data-cols-linear`, its fallback);
 * - **continuations flush** (`FLUSH`): every column of a continued block
 *   starts at the top of its cell (its first block keeps no top margin);
 * - **the move threshold** (`MOVEGAP`): a `.cols` block the handler moved
 *   whole to the next page by choice (a short block, or one whose column
 *   would have kept nothing — round 4) left less than a third
 *   ({@link MOVE_MAX_EMPTY}) of its page empty (owner decision, round 3); a column opening
 *   with a table never moved its block when the table's header and first row
 *   fit (`TABLEMOVE`); a column's part on a page that goes on never ends with
 *   a heading (`HEADLAST`, round 4);
 * - **code** (`CODE`): every `pre` whole across its page fragments, every
 *   character in order WITH its whitespace — line breaks and indentation
 *   (the text check above ignores whitespace; closed loop round 3: a
 *   highlighted fence lost its newlines on continuation pages); and every
 *   `pre` fragment's box inside the page area (`PREBOX`: its last line's
 *   half-leading, a blank last line, its border — closed loop round 4).
 *
 * Caveat (closed loop rounds 3–4). Paged.js 0.4.3 finds where a page's
 * last text node continues BY CONTENT (`createBreakToken`:
 * `indexOfTextNode` takes the first sibling text node that includes the
 * rendered one, then `indexOf` of the rendered rest inside it). Round 3
 * dismissed repeated text as a fixture artefact; round 4 showed it is real:
 * highlighted code repeats the text between its tokens on every line (the
 * real highlight.js: lines repeated or skipped, "Layout repeated", the rest
 * of the document lost), and so does prose with a phrase repeated between
 * inline elements. The runtime now gives such text nodes their own element
 * (src/paged/code-break.ts) — what remains is periodic text INSIDE one text
 * node (one sentence repeated, no inline element between): an UPSTREAM limit
 * no real document is expected to meet. Fixtures therefore use
 * non-periodic text ({@link prose}); periodic text would also let a lost
 * passage and a repeated one cancel out in the text check. The tags (`[T1]`:
 * every paragraph or row tagged) catch a lost block.
 *
 * Used by tests/integrity.test.ts over the column fixtures × a theme and size
 * matrix, and by scripts/columns-matrix.ts (the full matrix).
 */
import type { Frame, Page } from 'playwright-core';

/**
 * The hybrid's threshold as the owner decided it (round 3): a third of the
 * page. The oracle keeps its own copy — reading the handler's constant let a
 * mutated threshold judge itself (closed loop round 4, mutant L01); C.4
 * checks the two agree.
 */
export const MOVE_MAX_EMPTY = 1 / 3;

export interface Integrity {
  pages: number;
  /** Empty when the pages hold the document whole. */
  problems: string[];
}

/**
 * The page-side check: in the read view's page (the bundle loaded; pages in
 * `#orz-pages`), or — `at` — in another frame of it (the editor's preview
 * frame: pages in `#orz-doc`). The source rendering is always the page's.
 */
export async function integrity(page: Page, text: string, at: { frame?: Frame; rootId?: string } = {}): Promise<Integrity> {
  const frame = at.frame ?? page.mainFrame();
  const srcHtml = await page.evaluate((t) => (globalThis as unknown as { OrzCarrier: { renderPreview(t: string): Promise<string> } }).OrzCarrier.renderPreview(t), text);
  await frame.evaluate('window.__name = window.__name || ((f) => f)'); // tsx/esbuild helper names in evaluated functions
  return frame.evaluate(async ({ srcHtml, rootId, maxEmpty }) => {
    const t = document.createElement('template');
    t.innerHTML = srcHtml; // the content as rendered, the versions applied
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

    const area = document.getElementById(rootId)!;
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
      // a code fragment's box (its lines' half-leading, a blank line, its border, where it ends its padding) ends inside
      // the area: Paged.js measured glyphs only (PREBOX; closed loop round 4)
      content.querySelectorAll('pre').forEach((pre) => {
        if (pre.closest('.orz-toc') || pre.parentElement!.closest('pre')) return;
        const b = pre.getBoundingClientRect().bottom;
        if (pre.getBoundingClientRect().height > 0 && b > ar.bottom + 0.75) problems.push(`PREBOX p${pi + 1} "${(pre.textContent || '').trim().slice(0, 25)}" +${(b - ar.bottom).toFixed(1)}`);
      });
      if (!(content.textContent || '').trim() && !content.querySelector('img, svg')) problems.push(`BLANK p${pi + 1}`);
      // a table's continuation repeats its header exactly when the page CSS asks for it (`--orz-repeat-thead: 1`,
      // `repeat_table_header`; REPEAT — Paged.js' continuations and the column handler's)
      content.querySelectorAll('table[data-split-from], table[data-cols-split-from]').forEach((tb) => {
        const want = getComputedStyle(tb).getPropertyValue('--orz-repeat-thead').trim() === '1';
        const has = Array.from(tb.children).some((c) => c.tagName === 'THEAD' && c.hasAttribute('data-orz-repeated-head'));
        if (want !== has) problems.push(`REPEAT p${pi + 1} header ${has ? 'repeated against' : 'not repeated as'} the page CSS asks`);
      });
      // a table fragment with its header and no body row (a header stranded at a page bottom, F5)
      content.querySelectorAll('table').forEach((tb) => {
        const head = Array.from(tb.children).some((c) => c.tagName === 'THEAD' && (c.textContent || '').trim());
        const rows = Array.from(tb.querySelectorAll(':scope > tbody > tr')).some((r) => (r.textContent || '').trim());
        if (head && !rows) problems.push(`HEADONLY p${pi + 1}`);
      });
      // the hybrid's threshold (owner decision, round 3): a short block moved whole leaves less than a third of its
      // page empty (MOVEGAP: the space below the page's last drawn content, as a share of the page area)
      // the lowest drawn content of a page: text lines, replaced content and table rows — not the boxes of Paged.js'
      // wrappers, which reach the area's bottom (round 4: they hid every gap, mutant L02 survived)
      const lowest = (): number => {
        let low = ar.top;
        const tw = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          const el = n.parentElement;
          if (!el || !/[^\s]/.test((n as Text).data) || el.closest('[data-cols-moved-short], [data-cols-placeholder]') || getComputedStyle(el).visibility === 'hidden') continue;
          const rg = document.createRange();
          rg.selectNodeContents(n);
          for (const r of Array.from(rg.getClientRects())) if (r.height > 0) low = Math.max(low, r.bottom);
        }
        content.querySelectorAll('img, svg, canvas, hr, video, iframe, tr').forEach((e) => {
          if (e.closest('[data-cols-moved-short], [data-cols-placeholder]')) return;
          const r = e.getBoundingClientRect();
          if (r.height > 0 && r.width > 0) low = Math.max(low, r.bottom);
        });
        return low;
      };
      if (content.querySelector('[data-cols-moved-short]')) {
        const low = lowest();
        const empty = (ar.bottom - low) / ar.height;
        if (empty > maxEmpty + 0.03) problems.push(`MOVEGAP p${pi + 1} ${(empty * 100).toFixed(0)}% of the page left empty`);
      }
      // a block moved whole because a column would have kept nothing (round 4): a column opening with a table keeps
      // something whenever the table's header and first body row fit in the space left (TABLEMOVE)
      const movedCol = content.querySelector('[data-cols-moved-short="column"]');
      if (movedCol && pages[pi + 1]) {
        const low = lowest();
        const next = pages[pi + 1]!.querySelector('.pagedjs_page_content .cols[data-cols-cont]');
        Array.from(next ? next.children : []).forEach((cell, ci) => {
          const f = cell.firstElementChild;
          if (!f || f.tagName !== 'TABLE') return;
          const head = (f as HTMLTableElement).tHead?.getBoundingClientRect().height ?? 0;
          const row = (f as HTMLTableElement).tBodies[0]?.rows[0]?.getBoundingClientRect().height ?? 0;
          if (ar.bottom - low > head + row + 40) problems.push(`TABLEMOVE p${pi + 1} column ${ci + 1}: a table whose header and first row fit (${Math.round(head + row)} px of ${Math.round(ar.bottom - low)} px left) moved the block whole`);
        });
      }
      // a column's part on a page never ends with a heading when the block goes on (HEADLAST, round 4)
      const lastTop = top(content).filter((c) => getComputedStyle(c).display !== 'none').pop();
      const nextFirst = pages[pi + 1]?.querySelector('.pagedjs_page_content .cols[data-cols-cont]');
      if (lastTop && nextFirst) {
        Array.from(lastTop.children).forEach((cell, ci) => {
          const goesOn = nextFirst.children[ci];
          if (cell.hasAttribute('data-cols-placeholder') || !goesOn || goesOn.hasAttribute('data-cols-placeholder')) return; // the column ended here
          const kids = Array.from(cell.children).filter((k) => k.getBoundingClientRect().height > 0);
          const last = kids[kids.length - 1];
          if (last && /^H[1-6]$/.test(last.tagName)) problems.push(`HEADLAST p${pi + 1} column ${ci + 1} "${(last.textContent || '').trim().slice(0, 25)}"`);
        });
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
  }, { srcHtml, rootId: at.rootId ?? (at.frame ? 'orz-doc' : 'orz-pages'), maxEmpty: MOVE_MAX_EMPTY });
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
