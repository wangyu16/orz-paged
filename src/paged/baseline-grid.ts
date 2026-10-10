/**
 * The baseline grid (owner decision 2026-10-09, light-playful-1: "align the
 * ruled notebook lines with the text"): a Paged.js 0.4.3 Handler that keeps a
 * theme's page ruling under the text on every page.
 *
 * A theme opts in with two custom properties (none of the others does, so
 * for them this handler measures one probe per pagination and does nothing):
 *
 * - `--orz-grid` — the line pitch, an absolute length: the body leading
 *   (`calc(var(--font-size) * var(--line-height))`, the header's
 *   `font_size` × `line_height`);
 * - it draws the ruling from the top of each page's content box
 *   (`.pagedjs_area`) at `--orz-rule-at` + k × `--orz-grid`, and sets the
 *   running text (top-level paragraphs and lists) with exactly that leading.
 *
 * The handler supplies what CSS cannot know:
 *
 * 1. `--orz-rule-at` — where a body line's baseline falls inside its line box
 *    (measured once per pagination on a probe paragraph styled like the
 *    document's, so any body font and size sits on the lines), plus a small
 *    drop so the line runs just under the letters; set on every page.
 * 2. Snapping — every top-level block of the document starts on the grid:
 *    Paged.js walks the source in document order and appends each block
 *    (the `renderNode` hook) where it starts on the page, so the gap above
 *    it grows by what is missing (the previous block's bottom margin, or
 *    the first block's own top margin). After a heading, a table, a callout,
 *    code, math or an image of any height the text is back on the lines.
 *    Registered before the two-column handler, so a `.cols` block is placed
 *    before that handler measures where it starts.
 * 3. Off-grid text — a ruled block whose height is not a whole number of
 *    lines (a tall inline formula grew one line box) gets the class
 *    `orz-off-grid`: the theme hides the ruling behind it, so no line
 *    crosses its glyphs; the block after it is snapped back on the grid.
 *
 * Positions are measured relative to the page's content box, in CSS px:
 * the runtime paginates into an unscaled off-screen buffer (a reader's zoom
 * applies to the pages only after they are swapped in).
 * Browser only (DOM), registered by the paged runtime (src/paged/runtime.ts).
 */
import { Handler } from 'pagedjs';

/** The class a ruled block gets when its lines are off the grid (the theme hides the ruling behind it). */
export const OFF_GRID_CLASS = 'orz-off-grid';
/** px of tolerance for "on the grid" (sub-pixel layout). */
const EPS = 0.5;

const isEl = (n: Node | null | undefined): n is HTMLElement => !!n && n.nodeType === 1;

/** A block in the flow (not positioned out of it, not floated, displayed). */
function inFlow(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed' && cs.float === 'none';
}

/**
 * An element's layout box (a transform — Playful's tilted title — moves only
 * what is painted: its bounding box is not where the next block starts).
 */
function layoutRect(el: HTMLElement): DOMRect {
  if (getComputedStyle(el).transform === 'none') return el.getBoundingClientRect();
  const inline = el.style.getPropertyValue('transform');
  const priority = el.style.getPropertyPriority('transform');
  el.style.setProperty('transform', 'none', 'important');
  const r = el.getBoundingClientRect();
  if (inline) el.style.setProperty('transform', inline, priority);
  else el.style.removeProperty('transform');
  return r;
}

/** Top-level blocks whose text sits on the ruling (the rest hide it: an opaque background). */
function isRuled(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === 'UL') return !el.classList.contains('toc-list');
  if (tag === 'OL') return true;
  if (tag !== 'P') return false;
  if (el.classList.contains('katex-block') || el.querySelector('.katex-display')) return false;
  const kids = Array.from(el.childNodes).filter((c) => !(c.nodeType === 3 && !(c.textContent ?? '').trim()));
  return !(kids.length === 1 && isEl(kids[0]) && kids[0].tagName === 'IMG');
}

export interface GridStats {
  /** The pitch in px (0: the theme has no grid). */
  grid: number;
  /** Where the ruling sits in a line box, px from its top. */
  ruleAt: number;
  /** Blocks given extra margin to return to the grid. */
  snapped: number;
  /** Ruled blocks marked off the grid. */
  offGrid: number;
}

export class BaselineGridHandler extends Handler {
  readonly stats: GridStats = { grid: -1, ruleAt: 0, snapped: 0, offGrid: 0 };
  /** The handler of the latest previewer (tests read it through the runtime's result). */
  static last: BaselineGridHandler | null = null;

  constructor(chunker: unknown, polisher: unknown, caller: unknown) {
    super(chunker, polisher, caller);
    BaselineGridHandler.last = this;
  }

  /** Measure the pitch and the baseline once, on a probe paragraph inside the page's document body. */
  private measure(body: HTMLElement): void {
    if (this.stats.grid >= 0) return;
    const probe = document.createElement('p');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;width:10em;margin:0;padding:0;border:0;';
    const mark = document.createElement('span');
    mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
    const pitch = document.createElement('span');
    pitch.style.cssText = 'display:block;position:absolute;left:0;top:0;width:0;height:var(--orz-grid, 0px);';
    probe.append(mark, 'x', pitch);
    body.appendChild(probe);
    try {
      const r = probe.getBoundingClientRect();
      const grid = pitch.getBoundingClientRect().height;
      const line = r.height;
      if (!(grid > 2) || Math.abs(line - grid) > EPS) {
        // no grid, or the theme's leading is not the grid: do nothing
        this.stats.grid = 0;
        return;
      }
      const baseline = mark.getBoundingClientRect().bottom - r.top;
      const em = parseFloat(getComputedStyle(probe).fontSize) || 16;
      this.stats.grid = grid;
      this.stats.ruleAt = Math.min(grid - 1, baseline + Math.max(1, 0.08 * em));
    } finally {
      probe.remove();
    }
  }

  renderNode(clone: Node, _node: Node, layout: { element: HTMLElement }): void {
    if (!isEl(clone)) return;
    const body = clone.parentElement;
    if (!body || !body.classList.contains('markdown-body')) return;
    this.measure(body);
    if (!this.stats.grid) return;
    const cs = getComputedStyle(clone);
    if (cs.position === 'absolute' || cs.position === 'fixed' || cs.float !== 'none') return;
    let prev = clone.previousElementSibling as HTMLElement | null;
    while (prev && !inFlow(prev)) prev = prev.previousElementSibling as HTMLElement | null;
    if (prev) this.checkLines(prev);
    this.place(clone, prev, layout.element);
  }

  /** Mark a complete ruled block whose height is not a whole number of lines. */
  private checkLines(el: HTMLElement): void {
    if (!isRuled(el) || el.classList.contains(OFF_GRID_CLASS) || el.hasAttribute('data-split-to')) return;
    const lines = layoutRect(el).height / this.stats.grid;
    if (Math.abs(lines - Math.round(lines)) * this.stats.grid > EPS) {
      el.classList.add(OFF_GRID_CLASS);
      this.stats.offGrid++;
    }
  }

  /**
   * Put the block just appended (`el`, its top already final: the margins
   * above it are laid out) on the grid: the gap above it grows by what is
   * missing — the previous block's bottom margin becomes the whole gap (the
   * collapsed margin it was, plus the rest), or, for the first block on the
   * page, its own top margin grows.
   */
  private place(el: HTMLElement, prev: HTMLElement | null, area: HTMLElement): void {
    const grid = this.stats.grid;
    const a = area.getBoundingClientRect();
    // a block that already runs over the page bottom is fragmented into Paged.js' off-page column: its bounding box
    // spans both columns (its top is the next column's top), so its place is its FIRST fragment's (closed loop round 1, F3)
    const frags = el.getClientRects();
    const r = frags.length > 1 ? frags[0] : layoutRect(el);
    if (r.left >= a.right - 1) return; // overflowed into Paged.js' off-page column: it goes to the next page
    const top = r.top - a.top;
    const rem = ((top % grid) + grid) % grid;
    if (rem <= EPS || grid - rem <= EPS) return;
    const extra = grid - rem;
    if (prev) {
      const gap = r.top - layoutRect(prev).bottom;
      prev.style.marginBottom = `${Math.max(0, gap) + extra}px`;
    } else {
      el.style.marginTop = `${(parseFloat(getComputedStyle(el).marginTop) || 0) + extra}px`;
    }
    this.stats.snapped++;
  }

  afterPageLayout(page: HTMLElement): void {
    if (!this.stats.grid) return;
    page.style.setProperty('--orz-rule-at', `${Math.round(this.stats.ruleAt * 100) / 100}px`);
  }
}
