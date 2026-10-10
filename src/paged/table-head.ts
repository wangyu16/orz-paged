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

export class TableHeadHandler extends Handler {
  readonly stats: TableHeadStats = { repeated: 0 };
  /** The handler of the latest previewer. */
  static last: TableHeadHandler | null = null;

  constructor(chunker: unknown, polisher: unknown, caller: unknown) {
    super(chunker, polisher, caller);
    TableHeadHandler.last = this;
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
