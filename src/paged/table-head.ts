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

  onOverflow(overflow: Range | undefined, rendered: Element, bounds: DOMRect): Range | undefined {
    if (!overflow) return undefined;
    // a fragment that would keep the table's header and no body row (a header stranded at the page bottom — the
    // first row's `break-before: avoid` did not hold it, report-35 p19; closed loop round 4): the whole table goes on
    // to the next page, unless it already starts at the top of this one (it can go nowhere better)
    const whole = overflowTable(overflow, rendered);
    if (whole && !whole.hasAttribute('data-split-from') && Array.from(whole.children).some((c) => c.tagName === 'THEAD' && (c.textContent || '').trim())
      && keptBodyRows(whole, overflow) === 0 && (whole.rows[0]?.getBoundingClientRect().top ?? bounds.top) > bounds.top + 2 && overflow.comparePoint(whole, 0) < 0) {
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
      if (t.hasAttribute('data-split-from') || (t.rows[0]?.getBoundingClientRect().top ?? bounds.top) <= bounds.top + 2) return undefined;
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

  renderNode(clone: Node, node: Node): void {
    const at = isEl(clone) ? clone : clone.parentElement;
    const table = at?.closest('table');
    if (!table || !table.hasAttribute('data-split-from')) return;
    if (Array.from(table.children).some((c) => c.tagName === 'THEAD')) return;
    const source = (isEl(node) ? node : node.parentElement)?.closest('table');
    const head = source && Array.from(source.children).find((c) => c.tagName === 'THEAD');
    if (!head) return;
    if (getComputedStyle(table).getPropertyValue('--orz-repeat-thead').trim() !== '1') return;
    const copy = head.cloneNode(true) as Element;
    copy.setAttribute(REPEATED_HEAD_ATTRIBUTE, '');
    // after a caption / colgroup (they come first in a table), before the rows
    const before = Array.from(table.children).find((c) => c.tagName !== 'CAPTION' && c.tagName !== 'COLGROUP') ?? null;
    table.insertBefore(copy, before);
    this.stats.repeated++;
  }
}
