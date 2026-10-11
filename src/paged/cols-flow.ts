/**
 * The two-column handler (REBUILD §3b, owner decision 1, D-48: the HYBRID): a
 * Paged.js 0.4.3 Handler that keeps orz-markdown `.cols` grids readable
 * across a page break — a SHORT block (one that fits on a fresh page) moves
 * whole to the next page; a LONG one is split column by column at each page
 * bottom, so column 1 continues in column 1 and column 2 in column 2 on the
 * next page. Ported from the prototype (/tmp/cols-proto/src/cols-flow.ts,
 * mode `hybrid`, 2026-10-09; 8-document regression in tests/columns.test.ts).
 *
 * How it works. Paged.js walks the parsed SOURCE DOM in document order and
 * appends shallow clones into the page. When it appends a top-level `.cols`
 * (the `renderNode` hook), the clone sits exactly where the block starts on
 * the current page. The handler then
 *   1. deep-clones the source children into that clone (real width, real
 *      styles) to measure them,
 *   2. moves a block that would fit on a fresh page whole to the next page
 *      when that leaves less than a third of this page empty (hybrid), else measures every column's blocks against the page-area
 *      bottom,
 *   3. cuts each column at the last block (or line, for text blocks and list
 *      items) that fits, keeps the head in the SOURCE `.cols` and moves each
 *      column's remainder into a NEW sibling `.cols` (same class and style,
 *      fresh `data-ref`s, `data-break-before="page"`, an empty `.col`
 *      placeholder for a column that already ended so the others keep their
 *      track),
 *   4. removes the measurement clones; Paged.js then walks the pruned head,
 *      hits the forced break and renders the continuation on the next page —
 *      which re-enters this hook, so a block of any length is split page by
 *      page.
 *
 * Notes from the prototype's report (kept as rules here):
 * - Paged.js makes the page area a multicol box (`column-width` = the page
 *   width) so overflow lands in an off-page column; measuring inside it would
 *   fragment the clone into that column. The handler sets the area's
 *   `columnWidth` to `auto` while it measures and restores it after.
 * - A runaway guard: at most {@link MAX_CUTS} splits and moves per
 *   pagination (a layout that never converges stops being split, Paged.js'
 *   own behaviour takes over).
 * - The content of a split block ends above the page bottom by what the theme
 *   draws below it (the block's and a cell's bottom padding and border — a
 *   framed block), and the kept head is laid out and checked before the cut
 *   is applied (a cut re-planned when a list item's trailing space still
 *   overflows): else Paged.js breaks the grid itself, flowing column 2 under
 *   column 1 (found with the derived print themes, which frame blocks and
 *   cells; the prototype's themes had no frame).
 * - A column whose FIRST block is taller than a whole page can never fit
 *   (a table whose first row, or code, is: plain flow instead — round 5):
 *   at the top of a page it is forced onto that page (clipped at the bottom,
 *   as Paged.js clips any over-tall box) instead of being deferred forever.
 *
 * The move threshold ({@link MOVE_WHOLE_MAX_EMPTY}, owner decision round 3):
 * a short block moves whole only when that leaves less than a third of the
 * page empty; a short block that starts higher up is split at the page bottom.
 * Round 4: the threshold holds for every move by choice — also a block moved
 * because one column would keep nothing on this page (above a third, that
 * column keeps nothing here and the others split); a table in that column
 * keeps something when its header and first body row fit; and a heading
 * never ends a column's part on a page (it goes on with what it heads).
 *
 * Limits (documented, owner-accepted): a lone long column stays narrow; only
 * paragraphs, list items, blockquotes and plain divs split, and tables
 * between rows (their header repeated; round 3) — images, figures, code,
 * math, headings, boxed asides and nested grids move whole; a table whose
 * first row, or code, taller than a page lays its block out as plain flow
 * (`data-cols-linear`; code: round 5);
 * one-line widows are possible; over-tall blocks clip.
 *
 * No markup contract change: the input is orz-markdown's `.cols > .col` as
 * it is. Browser only (DOM), registered by the paged runtime (src/paged/runtime.ts).
 */
import { Handler } from 'pagedjs';

/** px kept free at the page bottom to absorb sub-pixel and rounding differences. */
const SAFETY = 2;

/**
 * The hybrid's threshold (owner decision, closed loop round 3): a block that
 * fits on a fresh page moves there whole only when moving it leaves less than
 * this share of the current page area empty (the space from the block's top to
 * the page bottom); otherwise it is split column by column at the page
 * bottom. Before, any block that fitted on a page moved whole, leaving up to
 * nearly a whole page blank.
 */
export const MOVE_WHOLE_MAX_EMPTY = 1 / 3;

/** On the (undrawn) head of a block the hybrid moved whole to the next page by choice: `""` a short block, `"column"` one whose column would have kept nothing. */
export const MOVED_SHORT = 'data-cols-moved-short';

/** The runaway guard: splits plus moves per pagination. */
export const MAX_CUTS = 2000;

/** What one `.cols` block did on a page. */
export type ColsOutcome = 'fits' | 'split' | 'moved' | 'fallback';

let seq = 0;
const newRef = (): string => `colsx-${++seq}`;
function reRefSelf(el: Element): void {
  el.setAttribute('data-ref', newRef());
}
function reRefDeep(el: Element): void {
  reRefSelf(el);
  el.querySelectorAll('[data-ref]').forEach((e) => e.setAttribute('data-ref', newRef()));
}

const isEl = (n: Node | null | undefined): n is HTMLElement => !!n && n.nodeType === 1;
const isText = (n: Node | null | undefined): n is Text => !!n && n.nodeType === 3;

function rectOf(n: Node): DOMRect | null {
  if (isEl(n)) {
    const r = n.getBoundingClientRect();
    if (r.height === 0 && r.width === 0 && getComputedStyle(n).display === 'none') return null;
    return r;
  }
  if (isText(n)) {
    if (!/\S/.test(n.data)) return null;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const r = rg.getBoundingClientRect();
    return r.height ? r : null;
  }
  return null;
}

/** True while a column's first block, which does not fit even at the top of a page, is split (`break-inside: avoid` ignored). */
let splitAvoided = false;

/** Things never cut through: replaced and atomic content, code, tables (split by rows instead: {@link splitTable}), math, boxed asides, nested grids. */
function unbreakable(el: HTMLElement): boolean {
  if (/^(IMG|FIGURE|PRE|TABLE|SVG|CANVAS|VIDEO|IFRAME|H[1-6]|HR)$/i.test(el.tagName)) return true;
  if (el.classList.contains('katex-display') || el.classList.contains('katex') || el.classList.contains('mermaid')) return true;
  const cs = getComputedStyle(el);
  // `break-inside: avoid` (an exam question) is kept whole — except at the top of a page where it does not fit
  // (`splitAvoided`): it never will, so it is split through its children like any block (round 2, C.4)
  if (!splitAvoided && (cs.breakInside === 'avoid' || (cs as unknown as { pageBreakInside?: string }).pageBreakInside === 'avoid')) return true;
  if (/(grid|flex)/.test(cs.display)) return true;
  return false;
}

function hasBlockChild(el: HTMLElement): boolean {
  for (const c of Array.from(el.children)) {
    const d = getComputedStyle(c).display;
    if (!/^inline/.test(d) && d !== 'contents' && d !== 'none') return true;
  }
  return false;
}

/** The index path of `node` inside `root` (childNodes indices). */
function pathOf(node: Node, root: Node): number[] {
  const p: number[] = [];
  while (node !== root) {
    const par = node.parentNode!;
    p.unshift(Array.prototype.indexOf.call(par.childNodes, node));
    node = par;
  }
  return p;
}
function atPath(root: Node, p: number[]): Node {
  let n: Node = root;
  for (const i of p) n = n.childNodes[i];
  return n;
}

/**
 * Line-split a text block (no block children): find the first word or atom
 * whose line box crosses `limit`; return the continuation (moved out of `s`),
 * or null when not even the first line fits.
 */
export function splitText(m: HTMLElement, s: HTMLElement, limit: number): HTMLElement | null {
  type Hit = { node: Node; offset: number | null };
  let hit: Hit | null = null;
  let firstAtom = true;
  let crossed = false;
  // the first atom of the last line seen (a glyph box can end above the limit while its line box does not)
  let lineTop = -Infinity;
  let lastLine: Hit | null = null;
  let lines = 0;
  const seen = (h: Hit, r: DOMRect): void => {
    if (r.top > lineTop + 1) { lineTop = r.top; lastLine = h; lines++; }
  };
  const visit = (n: Node): boolean => {
    if (isText(n)) {
      const re = /\S+/g;
      let mt: RegExpExecArray | null;
      while ((mt = re.exec(n.data))) {
        const rg = document.createRange();
        rg.setStart(n, mt.index);
        rg.setEnd(n, mt.index + mt[0].length);
        const rs = rg.getClientRects();
        const r = rs[0] || rg.getBoundingClientRect();
        if (r.bottom > limit) {
          crossed = true;
          hit = firstAtom ? null : { node: n, offset: mt.index };
          return true;
        }
        seen({ node: n, offset: mt.index }, r);
        firstAtom = false;
      }
      return false;
    }
    if (isEl(n)) {
      const atomic = /^(IMG|BR|SVG|svg)$/.test(n.tagName) || n.classList.contains('katex');
      if (atomic) {
        const r = n.getBoundingClientRect();
        if (r.bottom > limit) {
          crossed = true;
          hit = firstAtom ? null : { node: n, offset: null };
          return true;
        }
        seen({ node: n, offset: null }, r);
        firstAtom = false;
        return false;
      }
      for (const c of Array.from(n.childNodes)) if (visit(c)) return true;
    }
    return false;
  };
  for (const c of Array.from(m.childNodes)) if (visit(c)) break;
  // every glyph is above the limit but the block (its last line box, its padding) is not: the last line goes on
  // (C.3: the whole item moved instead, leaving a third of the column empty)
  if (!crossed && lines > 1) hit = lastLine;
  if (!hit) return null;
  const h = hit as Hit;
  const sNode = atPath(s, pathOf(h.node, m));
  const rg = document.createRange();
  if (h.offset === null) rg.setStartBefore(sNode);
  else rg.setStart(sNode, h.offset);
  rg.setEnd(s, s.childNodes.length);
  const frag = rg.extractContents();
  const rest = s.cloneNode(false) as HTMLElement;
  rest.appendChild(frag);
  reRefDeep(rest);
  // typographic continuity: a justified head keeps its last line justified, the tail has no indent
  if (getComputedStyle(m).textAlign === 'justify') s.style.textAlignLast = 'justify';
  rest.style.textIndent = '0';
  rest.style.marginTop = '0';
  rest.setAttribute('data-cols-split-from', '');
  s.setAttribute('data-cols-split-to', '');
  // trim the whitespace left at the cut
  const lastText = (function last(n: Node): Text | null {
    for (let c = n.lastChild; c; c = c.previousSibling) {
      if (isText(c)) return c;
      const r = last(c);
      if (r) return r;
    }
    return null;
  })(s);
  if (lastText) lastText.data = lastText.data.replace(/\s+$/, '');
  return rest;
}

/** A table whose column widths a split in a column froze (undone when its block falls back to plain flow). */
const FROZEN = 'data-cols-frozen';

/** The attribute of a header row copied onto a table's continuation (the table-head handler's, src/paged/table-head.ts). */
const REPEATED_HEAD = 'data-orz-repeated-head';

/**
 * Split a table in a column by rows (closed loop round 3: a table taller than
 * the rest of the page inside `.cols` was moved whole, could never fit, and
 * Paged.js broke the grid itself — a row landed in its hidden off-page
 * column): keep the body rows that end above `limit` in the head, move the
 * rest into a shallow copy of the table (its `thead` repeated when the page
 * CSS asks for it, `--orz-repeat-thead: 1`), or null when not even the first
 * body row fits (the table moves whole). A row is never cut.
 */
function splitTable(m: HTMLElement, s: HTMLElement, limit: number): HTMLElement | null {
  const bodiesM = Array.from(m.children).filter((c) => c.tagName === 'TBODY') as HTMLElement[];
  const bodiesS = Array.from(s.children).filter((c) => c.tagName === 'TBODY') as HTMLElement[];
  if (bodiesM.length !== 1 || bodiesS.length !== 1) return null;
  const rowsM = Array.from(bodiesM[0]!.children) as HTMLElement[];
  const rowsS = Array.from(bodiesS[0]!.children) as HTMLElement[];
  let i = 0;
  while (i < rowsM.length && rowsM[i]!.getBoundingClientRect().bottom <= limit) i++;
  if (i === 0 || i >= rowsM.length) return null;
  // both parts keep the measured column widths: a table with fewer rows re-measures its auto layout, its rows
  // grow, and the head no longer fits where it was planned (Paged.js then broke the grid)
  const firstRow = (m as HTMLTableElement).rows[0];
  const tw = m.getBoundingClientRect().width;
  // the column widths as shares of the table (a page's column can be narrower than where it was measured: a fixed
  // table wider than its column ran into the hidden column), the table at most its column's width
  const shares = firstRow && tw > 0 ? Array.from(firstRow.cells).map((c) => (c.getBoundingClientRect().width / tw) * 100) : [];
  const fix = (t: HTMLElement): void => {
    const r = (t as HTMLTableElement).rows[0];
    if (!r || !shares.length) return;
    t.style.tableLayout = 'fixed';
    t.style.width = `min(${tw.toFixed(1)}px, 100%)`;
    t.setAttribute(FROZEN, '');
    Array.from(r.cells).forEach((c, k) => { if (shares[k] !== undefined) (c as HTMLElement).style.width = `${shares[k]!.toFixed(3)}%`; });
  };
  fix(s);
  const rest = s.cloneNode(false) as HTMLElement;
  const head = Array.from(s.children).find((c) => c.tagName === 'THEAD');
  if (head && getComputedStyle(m).getPropertyValue('--orz-repeat-thead').trim() === '1') {
    const copy = head.cloneNode(true) as HTMLElement;
    copy.setAttribute(REPEATED_HEAD, '');
    rest.appendChild(copy);
  }
  const body = bodiesS[0]!.cloneNode(false) as HTMLElement;
  for (let k = i; k < rowsS.length; k++) body.appendChild(rowsS[k]!);
  rest.appendChild(body);
  fix(rest);
  reRefDeep(rest);
  rest.style.marginTop = '0';
  rest.setAttribute('data-cols-split-from', '');
  s.setAttribute('data-cols-split-to', '');
  return rest;
}

/** Split a block that straddles `limit`; return its continuation, or null (move it whole). */
function splitBlock(m: HTMLElement, s: HTMLElement, limit: number): HTMLElement | null {
  if (m.tagName === 'TABLE') return splitTable(m, s, limit);
  if (unbreakable(m)) return null;
  let rest: HTMLElement | null;
  if (hasBlockChild(m)) {
    const r = splitChildren(m, s, limit);
    if (r.rest && r.nothingFit) {
      // nothing of it fits: it moves whole — its children, moved into the continuation, go back first (C.3:
      // a nested list item's sub-list was lost here)
      while (r.rest.firstChild) s.appendChild(r.rest.firstChild);
      rest = null;
    } else rest = r.rest;
  } else rest = splitText(m, s, limit);
  // a continued list item does not repeat its bullet or number
  if (rest && m.tagName === 'LI') rest.style.listStyleType = 'none';
  return rest;
}

/**
 * Keep the children of `s` that fit above `limit`; move the rest into a
 * shallow clone (returned). `m` is a measured deep clone of `s` (same child
 * indices).
 */
function splitChildren(m: HTMLElement, s: HTMLElement, limit: number): { rest: HTMLElement | null; nothingFit: boolean } {
  const mk = Array.from(m.childNodes);
  const sk = Array.from(s.childNodes);
  let i = 0;
  let keptContent = false;
  for (; i < mk.length; i++) {
    const r = rectOf(mk[i]);
    if (!r) continue;
    if (r.bottom <= limit) {
      keptContent = true;
      continue;
    }
    break;
  }
  if (i >= mk.length) return { rest: null, nothingFit: false };
  const n = mk[i];
  const r = rectOf(n)!;
  let partial: HTMLElement | null = null;
  if (isEl(n) && r.top < limit) partial = splitBlock(n, sk[i] as HTMLElement, limit);
  if (!partial) {
    // a heading never ends a column's part on a page: it goes on with what it heads (closed loop round 4)
    let j = i - 1;
    for (; j >= 0; j--) {
      const k = mk[j];
      if (!rectOf(k)) continue; // whitespace, nothing drawn
      if (isEl(k) && /^H[1-6]$/.test(k.tagName)) { i = j; continue; }
      break;
    }
    keptContent = mk.slice(0, i).some((k) => !!rectOf(k));
  }
  const rest = s.cloneNode(false) as HTMLElement;
  reRefSelf(rest);
  rest.style.marginTop = '0';
  let liKept = 0;
  for (let k = 0; k < i; k++) if (isEl(sk[k]) && (sk[k] as HTMLElement).tagName === 'LI') liKept++;
  if (partial) {
    rest.appendChild(partial);
    i++;
  }
  for (let k = i; k < sk.length; k++) rest.appendChild(sk[k]);
  if (s.tagName === 'OL') {
    const start = Number(s.getAttribute('start') || '1');
    rest.setAttribute('start', String(start + liKept));
  }
  return { rest, nothingFit: !keptContent && !partial };
}

/** What a theme draws below an element's content: its bottom padding and border. */
function below(el: Element | null): number {
  if (!el) return 0;
  const cs = getComputedStyle(el);
  return (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
}

/** True when nothing visible precedes `el` inside `area` (the page's content so far). */
function nothingBefore(el: HTMLElement, area: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== area; n = n.parentElement) {
    for (let s = n.previousSibling; s; s = s.previousSibling) {
      if (isText(s) && /\S/.test(s.data)) return false;
      if (!isEl(s)) continue;
      if (getComputedStyle(s).display === 'none') continue;
      if ((s.textContent || '').trim() || s.querySelector('img, svg, canvas, hr, table')) return false;
      const r = s.getBoundingClientRect();
      if (r.height > 0 && /^(IMG|SVG|CANVAS|HR|TABLE)$/i.test(s.tagName)) return false;
    }
  }
  return true;
}

/** Fill the page clone with deep copies of `from`'s children (to measure them where the block will be). */
function fill(clone: HTMLElement, from: HTMLElement): void {
  while (clone.firstChild) clone.removeChild(clone.firstChild);
  for (const c of Array.from(from.childNodes)) clone.appendChild(c.cloneNode(true));
}

/** A split planned on a copy of the source (`trial`): its outcome and, for a cut, the continuation. */
type Plan = { outcome: 'fits' | 'fallback' | 'linear' } | { outcome: 'split' | 'moved'; rest: HTMLElement; byChoice?: boolean };

/**
 * Plan the cut of one block against `limit` on `trial` (a deep copy of the
 * source; `clone` holds the measured copies of the source's children, same
 * indices). Only `trial` is changed.
 */
function plan(clone: HTMLElement, trial: HTMLElement, limit: number, atTop: boolean, mayMove: boolean): Plan {
  const mCells = Array.from(clone.children) as HTMLElement[];
  const sCells = Array.from(trial.children) as HTMLElement[];
  // group the cells into grid rows by their top edge
  const rows: number[][] = [];
  let lastTop = -Infinity;
  mCells.forEach((c, i) => {
    const t = Math.round(c.getBoundingClientRect().top);
    if (Math.abs(t - lastTop) > 1) {
      rows.push([]);
      lastTop = t;
    }
    rows[rows.length - 1].push(i);
  });
  const rowBottom = (row: number[]): number => Math.max(...row.map((i) => mCells[i].getBoundingClientRect().bottom));
  let ri = 0;
  while (ri < rows.length && rowBottom(rows[ri]) <= limit) ri++;
  if (ri >= rows.length) return { outcome: 'fits' };

  // split the straddling row cell by cell
  const rest = trial.cloneNode(false) as HTMLElement;
  reRefSelf(rest);
  const row = rows[ri];
  let anyKept = ri > 0;
  const restCells: HTMLElement[] = [];
  if (mCells[row[0]].getBoundingClientRect().top < limit) {
    // when one column could keep nothing while another keeps content, the row would read out of
    // order (Q20 above Q10): move it whole — only when that leaves less than a third of the page empty (the
    // hybrid's threshold applies to every move, closed loop round 4); else the column keeps nothing here
    if (!atTop && ri === 0 && mayMove) {
      const keepsNothing = (c: HTMLElement): boolean => {
        const f = Array.from(c.children).find((k) => rectOf(k)) as HTMLElement | undefined;
        if (!f || f.getBoundingClientRect().bottom <= limit) return false;
        // a table splits between rows (round 3): it keeps nothing only when its header and first body row do not fit
        if (f.tagName === 'TABLE') {
          const body = (f as HTMLTableElement).tBodies[0]?.rows[0];
          return !body || body.getBoundingClientRect().bottom > limit;
        }
        return unbreakable(f) || f.getBoundingClientRect().top + 2 * parseFloat(getComputedStyle(f).lineHeight || '20') > limit;
      };
      if (row.some((i) => keepsNothing(mCells[i]))) return { outcome: 'moved', rest: moveAllOf(trial), byChoice: true };
    }
    for (const i of row) {
      const r = splitChildren(mCells[i], sCells[i], limit);
      if (r.rest && r.nothingFit && atTop && /^(TABLE|PRE)$/.test(Array.from(mCells[i].children).find((k) => rectOf(k))?.tagName ?? '')) {
        // a table whose first row is taller than a whole column page: no cut between rows can place it, and a
        // forced, clipped table is broken by Paged.js inside the hidden column (rows lost, closed loop round 3) —
        // the block falls back to the page's own flow (its columns one after the other, Paged.js splits the row).
        // So does code taller than a column page (round 5: forced whole, the fence was clipped and Paged.js broke
        // the grid; in the page's flow it breaks between lines like any fence — R.12)
        return { outcome: 'linear' };
      }
      if (r.rest && r.nothingFit && atTop) {
        // the column's first block is taller than a whole page: it can never fit, so it is forced onto
        // this page (clipped at the bottom, as Paged.js clips any over-tall box), never deferred forever
        const sc = sCells[i];
        while (r.rest.firstChild) sc.appendChild(r.rest.firstChild);
        // first, split it through its children even when it asks to be kept whole (an exam question taller than
        // the page: forced whole, it was clipped and Paged.js broke the grid itself — closed loop round 2, C.4)
        splitAvoided = true;
        let r2: ReturnType<typeof splitChildren>;
        try { r2 = splitChildren(mCells[i], sc, limit); } finally { splitAvoided = false; }
        if (r2.rest && !r2.nothingFit) {
          anyKept = true;
          restCells.push(r2.rest);
          continue;
        }
        if (r2.rest) while (r2.rest.firstChild) sc.appendChild(r2.rest.firstChild);
        const firstBlock = Array.from(sc.childNodes).find((k) => isEl(k) || (isText(k) && /\S/.test(k.data)));
        let k = firstBlock ? firstBlock.nextSibling : null;
        while (k) {
          const nx = k.nextSibling;
          r.rest.appendChild(k);
          k = nx;
        }
        r.nothingFit = false;
      }
      if (r.rest && !r.nothingFit) anyKept = true;
      if (!r.rest) {
        if (mCells[i].textContent!.trim() || mCells[i].querySelector('img,svg')) anyKept = true;
        const ph = sCells[i].cloneNode(false) as HTMLElement;
        reRefSelf(ph);
        ph.setAttribute('data-cols-placeholder', '');
        // it keeps the column's track only: a theme's frame or background of the column is not drawn empty
        ph.style.visibility = 'hidden';
        restCells.push(ph);
      } else restCells.push(r.rest);
    }
  } else {
    for (const i of row) restCells.push(sCells[i]);
  }
  // nothing of the block fits here and moving cannot help at the page top: Paged.js' own behaviour
  if (!anyKept && atTop) return { outcome: 'fallback' };
  restCells.forEach((c) => {
    // the continuation starts flush with the page top in every column
    const first = Array.from(c.children)[0] as HTMLElement | undefined;
    if (first) first.style.marginTop = '0';
    rest.appendChild(c);
  });
  for (let k = ri + 1; k < rows.length; k++) for (const i of rows[k]) rest.appendChild(sCells[i]);
  return { outcome: anyKept ? 'split' : 'moved', rest };
}

/** The whole of `trial`'s cells as a continuation (`trial` keeps none). */
function moveAllOf(trial: HTMLElement): HTMLElement {
  const rest = trial.cloneNode(false) as HTMLElement;
  reRefSelf(rest);
  for (const c of Array.from(trial.children)) rest.appendChild(c);
  return rest;
}

/** How many times a cut is re-planned when the kept head, laid out, still overflows the page. */
const ATTEMPTS = 4;

/** The largest overflow a re-plan corrects (px): trailing space under a last line, never a forced over-tall block. */
const MAX_TRAILING = 64;

/** The least a re-plan lowers the limit (px): about one line of body text, so the cut moves a line. */
export const REPLAN_STEP = 12;

/**
 * Lay out one `.cols` block whose page clone is `clone` (empty, appended by
 * Paged.js) and whose source is `src`, against the page area `area`.
 * Mutates the source: the head stays, the continuation follows as a sibling.
 *
 * A cut is planned on a copy of the source, then the kept head is laid out in
 * the page and checked: a line measured as fitting can still end below the
 * page (a list item's or a nested block's trailing padding, margin or half
 * leading under the last line's glyphs), and Paged.js would then break the
 * grid itself, flowing column 2 under column 1. The plan is then made again
 * with the limit raised by the overflow, at most {@link ATTEMPTS} times. Only
 * a checked plan is applied to the source (its children replaced by the
 * plan's, which keep their `data-ref`s: Paged.js has not rendered them yet).
 */
export function splitColsAt(clone: HTMLElement, src: HTMLElement, area: HTMLElement): ColsOutcome {
  const areaRect = area.getBoundingClientRect();
  fill(clone, src);
  const cleanup = (): void => {
    while (clone.firstChild) clone.removeChild(clone.firstChild);
  };
  // the content must end above the page bottom by what the theme draws below it (a framed block or cell)
  const bottom = Math.floor(areaRect.bottom) - SAFETY - Math.ceil(below(clone));
  let limit = bottom - Math.ceil(below(clone.firstElementChild));
  const box = clone.getBoundingClientRect();
  if (box.bottom <= Math.floor(areaRect.bottom) - SAFETY) {
    cleanup();
    return 'fits';
  }
  const atTop = box.top - areaRect.top < 4; // nothing above it on this page

  // the hybrid: a block that fits on a fresh page moves there whole — when that leaves less than a third of this page
  // empty (MOVE_WHOLE_MAX_EMPTY); else it is split here
  const emptied = (areaRect.bottom - box.top) / areaRect.height;
  const mayMove = emptied < MOVE_WHOLE_MAX_EMPTY;
  if (!atTop && box.height <= areaRect.height - SAFETY && mayMove) {
    cleanup();
    finishRest(clone, src, moveAllOf(src));
    clone.style.display = 'none';
    clone.setAttribute(MOVED_SHORT, ''); // the integrity oracle checks the space it left (tests/integrity.ts MOVEGAP)
    return 'moved';
  }

  let chosen: { trial: HTMLElement; plan: Plan } | null = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) fill(clone, src);
    const trial = src.cloneNode(true) as HTMLElement;
    const p = plan(clone, trial, limit, atTop, mayMove);
    chosen = { trial, plan: p };
    if (p.outcome !== 'split') break;
    // check the head as it will be laid out: every cell must end above the page bottom
    fill(clone, trial);
    // a small overflow is trailing space under a cell's last line; a large one is an over-tall block forced onto
    // the page (clipped there, the documented limit): only the small ones are corrected
    const over = Math.max(0, ...Array.from(clone.children).map((c) => c.getBoundingClientRect().bottom - bottom).filter((d) => d <= MAX_TRAILING));
    if (over <= 0.5) break;
    // the cut must move by at least a line: a limit lowered by a couple of px finds the same line break again, and
    // the re-plans run out with the head still overflowing — Paged.js then breaks the grid (closed loop round 2, C.2)
    limit -= Math.max(Math.ceil(over) + 1, REPLAN_STEP);
  }
  cleanup();
  const p = chosen!.plan;
  if (p.outcome === 'linear') {
    linearize(clone, src);
    return 'fallback';
  }
  if (p.outcome === 'fits' || p.outcome === 'fallback') return p.outcome;
  const cut = p as Extract<Plan, { rest: HTMLElement }>;
  src.replaceChildren(...Array.from(chosen!.trial.childNodes));
  finishRest(clone, src, cut.rest);
  if (cut.outcome === 'moved') {
    clone.style.display = 'none';
    // a move by choice (a column that would keep nothing) is held to the threshold too: the oracle checks the space
    // it left (MOVEGAP); a move forced because no column keeps anything is not a choice
    if (cut.byChoice) clone.setAttribute(MOVED_SHORT, 'column');
  }
  return cut.outcome;
}

/** On each block of a `.cols` laid out as plain flow: the index of the column it came from. */
export const FROM_COLUMN = 'data-cols-from';

/** The mark of a `.cols` block laid out as plain flow (its columns one after the other): {@link linearize}. */
export const LINEAR_ATTRIBUTE = 'data-cols-linear';

/**
 * The fallback of a block no cut can place (a table row taller than a whole
 * column page): the block — this page's clone and its source — becomes plain
 * flow, its columns one after the other, and Paged.js lays it out as any
 * content (a row split across pages, the table's header repeated): never a
 * broken grid, never a lost row (closed loop round 3).
 */
function linearize(clone: HTMLElement, src: HTMLElement): void {
  // a table split in a column earlier keeps the column's widths: as plain flow it takes the page's width again
  src.querySelectorAll<HTMLTableElement>(`table[${FROZEN}]`).forEach((t) => {
    t.removeAttribute(FROZEN);
    t.style.removeProperty('table-layout');
    t.style.removeProperty('width');
    const r = t.rows[0];
    if (r) Array.from(r.cells).forEach((c) => (c as HTMLElement).style.removeProperty('width'));
  });
  // the columns' content, one column after the other, directly in the block (no grid, no cells: Paged.js splits it
  // as any flow — a table nested in a block-level cell lost a row in its hidden column)
  const kids: Node[] = [];
  Array.from(src.children).forEach((c, i) => {
    if (c.hasAttribute('data-cols-placeholder')) return;
    for (const k of Array.from(c.childNodes)) {
      if (isEl(k)) k.setAttribute(FROM_COLUMN, String(i)); // which column it came from (tests read it)
      kids.push(k);
    }
  });
  src.replaceChildren(...kids);
  for (const el of [clone, src]) {
    el.setAttribute(LINEAR_ATTRIBUTE, '');
    el.style.display = 'block';
  }
}

/** The mark of a source `.cols` whose cells all moved to its continuation (an empty head). */
const MOVED = 'data-cols-moved';

function finishRest(clone: HTMLElement, src: HTMLElement, rest: HTMLElement): void {
  if (!src.firstElementChild) src.setAttribute(MOVED, '');
  rest.setAttribute('data-break-before', 'page');
  rest.setAttribute('data-cols-cont', '');
  rest.style.marginTop = '0';
  clone.style.marginBottom = '0';
  src.style.marginBottom = '0';
  src.after(rest);
}

/** The counts of one pagination (a Paged.js previewer makes its own handler instances). */
export type ColsStats = Record<ColsOutcome, number>;

/** The handler class Paged.js instantiates per previewer (`registerHandlers(ColsFlowHandler)`). */
export class ColsFlowHandler extends Handler {
  /** What the blocks of this pagination did (tests read it through the runtime's result). */
  readonly stats: ColsStats = { fits: 0, split: 0, moved: 0, fallback: 0 };

  constructor(chunker: unknown, polisher: unknown, caller: unknown) {
    super(chunker, polisher, caller);
    ColsFlowHandler.last = this;
  }

  /** The handler of the latest previewer (the runtime reports its stats). */
  static last: ColsFlowHandler | null = null;

  /**
   * Paged.js 0.4.3's undisplayed filter (`filters/undisplayed.js`) marks EVERY
   * element with an inline `style` `data-undisplayed` — and a marked element is
   * never given its forced page break (`needsPageBreak`). orz-markdown writes a
   * ratio (`::: cols 1 2`) as an inline `grid-template-columns`, so such a block's
   * continuation (`data-break-before="page"`) did not break: its text was lost or
   * repeated (closed loop round 2). The grid and its cells are always displayed:
   * the mark is taken off them here — in `filter`, which runs on the parsed
   * content right after the built-in filter (registered before this handler) and
   * before the layout reads it (`afterParsed` is too late for the first page).
   */
  filter(parsed: DocumentFragment | Element): void {
    parsed.querySelectorAll('.cols[data-undisplayed], .col[data-undisplayed]').forEach((e) => e.removeAttribute('data-undisplayed'));
  }

  renderNode(clone: Node, node: Node, layout: { element: HTMLElement }): void {
    if (!isEl(node) || !node.classList.contains('cols')) return;
    if (node.parentElement && node.parentElement.closest('.cols')) return; // nested: moved or split with its cell
    if (this.stats.split + this.stats.moved > MAX_CUTS) return; // the runaway guard
    if (node.hasAttribute(LINEAR_ATTRIBUTE)) return; // plain flow (a fallback): Paged.js lays it out
    const area = layout.element;
    if (node.hasAttribute(MOVED) && !node.firstElementChild) {
      // the empty head of a block moved whole: never drawn. Paged.js can lay it out again at the top of the next
      // page (the page before overflowed at it); its continuation then follows at once, not after another page
      // break — that left a blank page (closed loop round 2, C.4)
      (clone as HTMLElement).style.display = 'none';
      const rest = node.nextElementSibling;
      if (rest && rest.hasAttribute('data-cols-cont') && nothingBefore(clone as HTMLElement, area)) rest.removeAttribute('data-break-before');
      return;
    }
    // measure outside Paged.js' multicol page area (see the module comment)
    const prev = area.style.columnWidth;
    area.style.columnWidth = 'auto';
    let res: ColsOutcome;
    try {
      res = splitColsAt(clone as HTMLElement, node, area);
    } finally {
      area.style.columnWidth = prev;
    }
    this.stats[res]++;
  }
}
