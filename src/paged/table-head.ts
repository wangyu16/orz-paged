/**
 * Table headers repeat on continuation pages (`repeat_table_header`, on by
 * default; closed loop round 2): a Paged.js 0.4.3 Handler.
 *
 * Paged.js breaks a long table between rows, but it does not repeat the
 * table's `<thead>` (CSS `display: table-header-group` does nothing there):
 * the continuation on the next page is a shallow clone of the table (marked
 * `data-split-from`) rebuilt around the first row that did not fit, with no
 * header. This handler puts a copy of the source table's `<thead>` into that
 * clone AS IT IS BUILT — in the `renderNode` hook, when Paged.js appends the
 * first node of the continuation — so the header is in the page before
 * Paged.js measures what overflows: the rows it pushes out go to the next
 * page, none is clipped or lost.
 *
 * Rows lost at unlucky lengths (closed loop round 3, UPSTREAM Paged.js
 * 0.4.3 `findOverflow` — it reproduces without any orz handler): when
 * Paged.js removes a table's overflow, the fragment's auto table layout
 * recomputes its column widths for the rows that stay, a kept row can grow
 * and end below the page — into Paged.js' hidden off-page column, where it is
 * never printed (one row in a few hundred lengths of a sweep). In
 * `onOverflow`, before the removal, the handler freezes the fragment's column
 * widths as they are measured (`table-layout: fixed`, the table's and the
 * first row's cells' widths), and pulls a kept row whose bottom is within
 * {@link FLUSH_PX} of the page bottom into the overflow (it would end below
 * it after any re-measure), never the fragment's only body row. A fragment
 * that would hold the header and no body row moves whole to the next page
 * (round 4: the first row's `break-before: avoid` alone left a header at a
 * page bottom).
 *
 * A row taller than the page area (closed loop round 5: a "Question / Answer
 * / Pts" table whose answer ran to 360 words): rows are `break-inside:
 * avoid` (the theme), so the browser's page columns push such a row whole
 * past the page — under a header, Paged.js then broke before the body and
 * left a fragment of the header alone; its continuation repeated the header,
 * broke the same way, and Paged.js gave up ("Layout repeated"): the row, the
 * later rows and everything after the table were lost. A fragment at the top
 * of its page (it can go nowhere better) that would keep no body row lets its
 * first body row break inside (`break-inside: auto`, on that fragment's row
 * only) and the overflow is found again: the row is split under the header
 * like any long block. Should a fragment still keep no body row, its repeated
 * header is taken out (a header never repeats on a page that holds none of
 * the table's rows) — the oracle's `HEADONLY` and `REPEAT` hold either way.
 *
 * The page CSS opts in with `--orz-repeat-thead: 1` on tables (set by
 * src/doc/page-css.ts when `repeat_table_header` is true; a table can opt out
 * with `--orz-repeat-thead: 0`). Browser only (DOM), registered by the paged
 * runtime (src/paged/runtime.ts).
 */
import { Handler } from 'pagedjs';

/** The attribute a repeated header carries (tests and print CSS can find it). */
export const REPEATED_HEAD_ATTRIBUTE = 'data-orz-repeated-head';

export interface TableHeadStats {
  /** Headers repeated on continuation pages. */
  repeated: number;
}

const isEl = (n: Node | null | undefined): n is Element => !!n && n.nodeType === 1;

/** A kept row ending this close to the page bottom (px) moves to the next page with the overflow. */
export const FLUSH_PX = 2;

/** The table row a Paged.js overflow range starts at (in `rendered`), or null. */
function overflowRow(overflow: Range, rendered: Element): HTMLTableRowElement | null {
  const c = overflow.startContainer;
  let at: Node | null = c;
  if (isEl(c) && c.childNodes[overflow.startOffset]) at = c.childNodes[overflow.startOffset]!;
  const el = isEl(at) ? at : at?.parentElement ?? null;
  const row = el?.closest('tr') ?? (isEl(c) && /^(TBODY|THEAD|TABLE)$/.test(c.tagName) && isEl(at) && at.tagName === 'TR' ? (at as HTMLTableRowElement) : null);
  return row && rendered.contains(row) ? (row as HTMLTableRowElement) : null;
}

/**
 * Freeze a laid-out table fragment's column widths (the removal of its
 * overflow must not re-measure them): its first row's cells keep their
 * widths (`table-layout: fixed`), together at most the page area's width
 * (`maxWidth`). Only the cells are frozen, never the table's width: a table
 * running into Paged.js' off-page column measures as the union of its
 * fragments (`getBoundingClientRect`, even `offsetWidth`: several pages wide),
 * and frozen at that width it ran off the page wherever a theme let the
 * width apply (closed loop round 4, F9). The first row lies in one column:
 * its width is the table's.
 */
function freeze(table: HTMLTableElement, maxWidth: number): void {
  if (table.hasAttribute('data-orz-frozen-cols')) return;
  const first = table.rows[0];
  if (!first) return;
  const widths = Array.from(first.cells).map((c) => c.getBoundingClientRect().width);
  const w = first.getBoundingClientRect().width;
  if (!w || widths.some((x) => !x)) return;
  const k = maxWidth > 0 ? Math.min(1, maxWidth / w) : 1;
  table.setAttribute('data-orz-frozen-cols', '');
  table.style.tableLayout = 'fixed';
  Array.from(first.cells).forEach((c, i) => { (c as HTMLElement).style.width = `${(widths[i]! * k).toFixed(2)}px`; });
}

/** The body rows of a table fragment before the overflow starts (what the fragment keeps). */
function keptBodyRows(table: HTMLTableElement, overflow: Range): number {
  let n = 0;
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      // a row at or after the overflow's start is not kept
      if (overflow.comparePoint(row, 0) >= 0) return n;
      if ((row.textContent || '').trim() || row.querySelector('img, svg')) n++;
    }
  }
  return n;
}

/** The table a Paged.js overflow range starts in (in `rendered`), or null. */
function overflowTable(overflow: Range, rendered: Element): HTMLTableElement | null {
  const c = overflow.startContainer;
  const at = isEl(c) && c.childNodes[overflow.startOffset] ? c.childNodes[overflow.startOffset]! : c;
  const el = isEl(at) ? at : at.parentElement;
  const t = el?.closest('table') ?? (isEl(c) ? c.closest('table') : null);
  return t && rendered.contains(t) ? (t as HTMLTableElement) : null;
}

/** The part of Paged.js' Layout the handler calls (it is the hooks' fourth argument). */
interface OverflowFinder { findOverflow(rendered: Element, bounds: DOMRect): Range | undefined }

/** The attribute of a row the handler let break inside (it was taller than the page area under its header). */
export const ROW_SPLIT_ATTRIBUTE = 'data-orz-row-split';

/** The fragment's first body row, or null. */
const firstBodyRow = (t: HTMLTableElement): HTMLTableRowElement | null => t.tBodies[0]?.rows[0] ?? null;

/**
 * True when the table fragment starts at the top of the page area (it cannot move to a better place). A box the
 * browser pushed past the page (into Paged.js' off-page column) also measures at the area's top — but to its right
 * (closed loop round 5: a caption kept alone on a page, its header and rows pushed on): that is not the top.
 */
const atTop = (t: HTMLTableElement, bounds: DOMRect): boolean => {
  if (t.hasAttribute('data-split-from')) return true;
  const r = (t.rows[0] ?? t).getBoundingClientRect();
  return r.top <= bounds.top + 2 && r.left < bounds.right - 1;
};

export class TableHeadHandler extends Handler {
  readonly stats: TableHeadStats = { repeated: 0 };
  /** The handler of the latest previewer. */
  static last: TableHeadHandler | null = null;

  constructor(chunker: unknown, polisher: unknown, caller: unknown) {
    super(chunker, polisher, caller);
    TableHeadHandler.last = this;
  }

  /** Rows pulled onto the next page (tests read it). */
  static pulled = 0;

  /** Tables moved whole to the next page because their fragment would have held only the header (tests read it). */
  static movedWhole = 0;

  /** The source rows by `data-ref` (recorded as Paged.js renders them). */
  private readonly sourceRows = new Map<string, HTMLTableRowElement>();

  /** Rows taller than the page area let break inside (tests read it). */
  static rowsSplit = 0;

  /** Repeated headers taken out of a fragment that would hold no body row (tests read it). */
  static headsDropped = 0;

  onOverflow(overflow: Range | undefined, rendered: Element, bounds: DOMRect, layout?: OverflowFinder): Range | undefined {
    if (!overflow) return undefined;
    const tall = this.tallRow(overflow, rendered, bounds, layout);
    if (tall) return tall;
    // a fragment that would keep the table's header and no body row (a header stranded at the page bottom — the
    // first row's `break-before: avoid` did not hold it, report-35 p19; closed loop round 4): the whole table goes on
    // to the next page, unless it already starts at the top of this one (it can go nowhere better)
    const whole = overflowTable(overflow, rendered);
    if (whole && !whole.hasAttribute('data-split-from') && Array.from(whole.children).some((c) => c.tagName === 'THEAD' && (c.textContent || '').trim())
      && keptBodyRows(whole, overflow) === 0 && !atTop(whole, bounds) && overflow.comparePoint(whole, 0) < 0) {
      const r = document.createRange();
      r.setStartBefore(whole);
      r.setEnd(overflow.endContainer, overflow.endOffset);
      TableHeadHandler.movedWhole++;
      return r;
    }
    const row = overflowRow(overflow, rendered);
    const table = row?.closest('table') as HTMLTableElement | null | undefined;
    if (!row || !table) return undefined;
    freeze(table, bounds.width);
    // a kept row flush with the page bottom goes on with the overflow (not the fragment's only body row)
    const prev = row.previousElementSibling as HTMLElement | null;
    if (!prev || prev.tagName !== 'TR' || row.parentElement?.tagName !== 'TBODY') return undefined;
    if (prev.getBoundingClientRect().bottom <= bounds.bottom - FLUSH_PX) return undefined;
    if (!prev.previousElementSibling) {
      // the fragment's only body row is flush with the bottom: never pulled alone (its header would stay behind), and
      // kept it ran into the hidden column (round 4, a 1 px sweep) — the whole table goes on to the next page instead,
      // unless it starts at the top of this one
      const t = table as HTMLTableElement;
      if (atTop(t, bounds)) return undefined;
      const whole = document.createRange();
      whole.setStartBefore(t);
      whole.setEnd(overflow.endContainer, overflow.endOffset);
      TableHeadHandler.movedWhole++;
      return whole;
    }
    const r = document.createRange();
    r.setStartBefore(prev);
    r.setEnd(overflow.endContainer, overflow.endOffset);
    TableHeadHandler.pulled++;
    return r;
  }

  /**
   * A fragment at the top of its page that would keep no body row, or whose first body row runs on past the page
   * (into the off-page column): that row is taller than what the page leaves under the header — it is let break
   * inside, and the overflow found again (see the module comment). Null when that is not the case.
   */
  private tallRow(overflow: Range, rendered: Element, bounds: DOMRect, layout?: OverflowFinder): Range | null {
    if (!layout || typeof layout.findOverflow !== 'function') return null;
    const at = overflowTable(overflow, rendered);
    const tables = [...(at ? [at] : []), ...Array.from(rendered.querySelectorAll('table')).filter((x) => x !== at)] as HTMLTableElement[];
    for (const t of tables) {
      if (!atTop(t, bounds)) continue;
      // a table in a column of the column handler is that handler's (a row taller than a column page: plain flow, C.6)
      if (t.closest('.cols:not([data-cols-linear])')) continue;
      const row = firstBodyRow(t);
      if (!row || !(row.textContent || '').trim()) continue;
      // the fragment keeps no body row (Paged.js broke before it), or its first row runs on past the page — kept
      // whole, its later lines in Paged.js' off-page column (the browser fragments a row it cannot move)
      const rr = row.getBoundingClientRect();
      const none = t === at && keptBodyRows(t, overflow) === 0;
      if (!none && rr.right <= bounds.right + 1 && rr.bottom <= bounds.bottom + 1) continue;
      let again: Range | undefined = overflow;
      if (row.getAttribute('data-break-inside') === 'avoid' || getComputedStyle(row).breakInside === 'avoid') {
        // Paged.js checks a page while it lays a row out: the row may still lack its later cells (Paged.js appends them
        // after the break) — measured without them, the answer was wider than it ends up and its last kept lines ran on
        // into the off-page column. The missing cells are put in for the measure (copies of the source row's), the
        // widths frozen as measured with them (each cell's width in its first column: a cell the browser fragmented
        // measures as the union of its fragments), and taken out again.
        const src = this.sourceRows.get(row.getAttribute('data-ref') || '');
        const temp: Element[] = [];
        if (src && src.cells.length > row.cells.length) {
          for (const c of Array.from(src.cells).slice(row.cells.length)) { const k = c.cloneNode(true) as Element; k.setAttribute('data-orz-measure', ''); row.appendChild(k); temp.push(k); }
        }
        if (!t.hasAttribute('data-orz-frozen-cols') && t.rows[0] === row) {
          const cells = Array.from(row.cells);
          const widths = cells.map((c) => c.getClientRects()[0]?.width ?? 0);
          if (widths.every((x) => x > 0)) {
            t.setAttribute('data-orz-frozen-cols', '');
            t.style.tableLayout = 'fixed';
            cells.forEach((c, i) => { (c as HTMLElement).style.width = `${widths[i]!.toFixed(2)}px`; });
          }
        }
        row.removeAttribute('data-break-inside');
        row.style.breakInside = 'auto';
        row.setAttribute(ROW_SPLIT_ATTRIBUTE, '');
        TableHeadHandler.rowsSplit++;
        // what the row draws below its last line (its cells' bottom padding and border, the table's) must fit too: the
        // break is found against an area that much shorter (else the last line went on into the off-page column)
        const under = Math.max(0, ...Array.from(row.cells).map((c) => { const cs = getComputedStyle(c); return (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0); }))
          + (parseFloat(getComputedStyle(t).borderBottomWidth) || 0) + (parseFloat(getComputedStyle(t).borderSpacing.split(' ').pop() || '0') || 0) + 2;
        again = layout.findOverflow(rendered, new DOMRect(bounds.x, bounds.y, bounds.width, Math.max(0, bounds.height - under)));
        for (const k of temp) k.remove();
        if (!again || !none || keptBodyRows(t, again) > 0) return again ?? null;
      }
      if (!none) return null;
      // still no body row kept under a repeated header: the header goes (it never repeats alone)
      const head = Array.from(t.children).find((c) => c.tagName === 'THEAD' && c.hasAttribute(REPEATED_HEAD_ATTRIBUTE));
      if (!head) return again === overflow ? null : again;
      head.remove();
      t.setAttribute('data-orz-head-dropped', '');
      this.stats.repeated--;
      TableHeadHandler.headsDropped++;
      return layout.findOverflow(rendered, bounds) ?? null;
    }
    return null;
  }

  renderNode(clone: Node, node: Node): void {
    if (isEl(node) && node.tagName === 'TR' && node.getAttribute('data-ref')) this.sourceRows.set(node.getAttribute('data-ref')!, node as HTMLTableRowElement);
    const at = isEl(clone) ? clone : clone.parentElement;
    const table = at?.closest('table');
    if (!table || !table.hasAttribute('data-split-from') || table.hasAttribute('data-orz-head-dropped')) return;
    if (Array.from(table.children).some((c) => c.tagName === 'THEAD')) return;
    // the source table by the fragment's `data-ref` (the node's own ancestors are a fallback: a continuation rebuilt
    // around a cell of a rowspan, round 5)
    const ref = table.getAttribute('data-ref');
    const root = node.getRootNode() as ParentNode;
    const source = (ref && typeof root.querySelector === 'function' ? root.querySelector(`table[data-ref="${CSS.escape(ref)}"]`) : null)
      ?? (isEl(node) ? node : node.parentElement)?.closest('table');
    const head = source && Array.from(source.children).find((c) => c.tagName === 'THEAD');
    if (!head) return;
    if (getComputedStyle(table).getPropertyValue('--orz-repeat-thead').trim() !== '1') return;
    // a continuation that starts inside a row (the rest of a row taller than the page): no header over the rest of a
    // row — under it, the rest did not fit either and Paged.js laid out a header alone, again and again ("Layout
    // repeated"; closed loop round 5). The header repeats on the next page that starts with a row.
    if ((isEl(node) ? node : node.parentElement)?.closest('td, th')) {
      table.setAttribute('data-orz-head-dropped', '');
      return;
    }
    const copy = head.cloneNode(true) as Element;
    copy.setAttribute(REPEATED_HEAD_ATTRIBUTE, '');
    // after a caption / colgroup (they come first in a table), before the rows
    const before = Array.from(table.children).find((c) => c.tagName !== 'CAPTION' && c.tagName !== 'COLGROUP') ?? null;
    table.insertBefore(copy, before);
    this.stats.repeated++;
  }
}
