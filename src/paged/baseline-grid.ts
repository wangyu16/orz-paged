/**
 * The baseline grid (owner decisions 2026-10-09 and 2026-10-11,
 * light-playful-1: "contents on a ruled notebook"): a Paged.js 0.4.3 Handler
 * that keeps a theme's page ruling under the text on every page. The ruling
 * is part of the paper: it is never interrupted by a text block; what is not
 * written on the lines is a separate sheet attached on top of the page.
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
 * Every top-level block is one of four kinds ({@link kindOf}):
 *
 * - **text** — paragraphs and lists: one line box per rule (the theme sets
 *   the leading), started on a grid line;
 * - **lined** — headings, rules (`hr`), footnotes, the TOC element:
 *   written on the lines in another face or size. Their leading is a whole
 *   number of lines (the theme's CSS); where their first baseline falls in a
 *   line box depends on the font, so the handler measures it once per
 *   pagination on a probe of each and sets, on every page's text block,
 *   `--orz-sh-<k>` (a relative shift, at most half a line, that puts the
 *   first baseline on a rule), `--orz-mb-<k>` (the margin-bottom that ends
 *   the block at the end of its last line, plus its own blank line) — the
 *   theme's CSS applies them; the block itself starts on a grid line;
 * - **math** — a display formula: its height depends on the formula, so it
 *   is aligned when it is complete (when the next block is appended, or at
 *   the page end): its baseline is moved onto a rule (a relative shift) and
 *   its height rounded up to whole lines (padding-bottom), plus the theme's
 *   blank line;
 * - **box** — everything else (tables, code, callouts, quotes, figures,
 *   diagrams, columns, the boxed document elements): a sheet on top of the paper. Its
 *   top is placed on a rule (one line under the text above it) and, when it
 *   is complete, it is grown to end on a rule; the text after it is back on
 *   the lines.
 *
 * The handler supplies what CSS cannot know:
 *
 * 1. `--orz-rule-at` — where a body line's baseline falls inside its line box
 *    (measured once per pagination on a probe paragraph styled like the
 *    document's, so any body font and size sits on the lines), plus a small
 *    drop so the line runs just under the letters; set on every page.
 * 2. Placing — Paged.js walks the source in document order and appends each
 *    block (the `renderNode` hook) where it starts on the page; the gap
 *    above it changes by what is missing (the previous block's bottom
 *    margin, or the first block's own top margin): a text or lined block
 *    starts on a grid line, a box on a rule. Registered before the
 *    two-column handler, so a `.cols` block is placed before that handler
 *    measures where it starts.
 * 3. Completing — when the next block is appended (or the page is laid out)
 *    the previous one is complete: a math block is aligned, a box grown to
 *    a rule (never past the page's content box: a box that would no longer
 *    fit is left as it is), a ruled block whose height is not a whole number
 *    of lines (a tall inline formula grew one line box) gets the class
 *    `orz-off-grid`: the theme hides the ruling behind it, so no line crosses
 *    its glyphs.
 *
 * Positions are measured relative to the page's content box, in CSS px:
 * the runtime paginates into an unscaled off-screen buffer (a reader's zoom
 * applies to the pages only after they are swapped in).
 * Browser only (DOM), registered by the paged runtime (src/paged/runtime.ts).
 */
import { Handler } from 'pagedjs';

/** The class a ruled block gets when its lines are off the grid (the theme hides the ruling behind it). */
export const OFF_GRID_CLASS = 'orz-off-grid';
/** The class of a paragraph holding only an image (the theme sets it as a picture pasted on the page). */
export const PICTURE_CLASS = 'orz-picture';
/** px of tolerance for "on the grid" (sub-pixel layout). */
const EPS = 0.5;
/** The attribute of a block the handler completed (aligned or grown): never twice. */
const DONE = 'data-orz-grid-done';

const isEl = (n: Node | null | undefined): n is HTMLElement => !!n && n.nodeType === 1;
const mod = (x: number, m: number): number => ((x % m) + m) % m;

/** A block in the flow (not positioned out of it, not floated, displayed). */
function inFlow(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed' && cs.float === 'none';
}

/**
 * An element's layout box (a transform — Playful's tilted callouts — or a
 * relative shift — a heading moved onto its rule — moves only what is
 * painted: its bounding box is not where the next block starts).
 */
function layoutRect(el: HTMLElement): DOMRect {
  const cs = getComputedStyle(el);
  const dy = cs.position === 'relative' ? parseFloat(cs.top) || 0 : 0;
  let r: DOMRect;
  if (cs.transform === 'none') r = el.getBoundingClientRect();
  else {
    const inline = el.style.getPropertyValue('transform');
    const priority = el.style.getPropertyPriority('transform');
    el.style.setProperty('transform', 'none', 'important');
    r = el.getBoundingClientRect();
    if (inline) el.style.setProperty('transform', inline, priority);
    else el.style.removeProperty('transform');
  }
  return dy ? new DOMRect(r.x, r.y - dy, r.width, r.height) : r;
}

/** A display formula block (KaTeX). */
function isMath(el: HTMLElement): boolean {
  return el.tagName === 'P' && (el.classList.contains('katex-block') || !!el.querySelector('.katex-display'));
}

/** A paragraph holding only an image (a picture: a box). */
function isImageOnly(el: HTMLElement): boolean {
  if (el.tagName !== 'P') return false;
  const kids = Array.from(el.childNodes).filter((c) => !(c.nodeType === 3 && !(c.textContent ?? '').trim()));
  return kids.length === 1 && isEl(kids[0]) && kids[0].tagName === 'IMG';
}

/** The lined kinds, each with its probe (the custom properties are `--orz-sh-<id>` and `--orz-mb-<id>`; a quote is a box — a slip of paper clipped on, owner 2026-10-11). */
const LINED: ReadonlyArray<{ id: string; html: string; match(el: HTMLElement): boolean }> = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `h${n}`, html: `<h${n}>X</h${n}>`, match: (el: HTMLElement) => el.tagName === `H${n}` })),
  { id: 'fn', html: '<section class="footnotes"><ol class="footnotes-list"><li class="footnote-item"><p>X</p></li></ol></section>', match: (el) => el.tagName === 'SECTION' && el.classList.contains('footnotes') },
  { id: 'toc', html: '<section class="orz-element orz-el-toc"><h2 class="orz-toc-heading">X</h2></section>', match: (el) => el.classList.contains('orz-el-toc') },
];

type Kind = 'text' | 'lined' | 'math' | 'box';

/** What a top-level block is on ruled paper (see the module comment). */
export function kindOf(el: HTMLElement): Kind {
  const tag = el.tagName;
  if (tag === 'P') return isMath(el) ? 'math' : isImageOnly(el) ? 'box' : 'text';
  if (tag === 'UL') return el.classList.contains('toc-list') ? 'box' : 'text';
  if (tag === 'OL') return 'text';
  if (tag === 'HR') return 'lined';
  if (el.classList.contains('orz-el-timestamp') || el.classList.contains('orz-el-letter-inside-address')) return 'lined';
  if (LINED.some((k) => k.match(el))) return 'lined';
  return 'box';
}

/** Split by Paged.js (or the column handler): a fragment is never grown or aligned. */
function isFragment(el: HTMLElement): boolean {
  return Array.from(el.attributes).some((a) => a.name.startsWith('data-split') || a.name.startsWith('data-cols'))
    || !!el.querySelector('[data-split-from],[data-split-to],[data-cols-placeholder],[data-cols-from],[data-cols-linear],[data-cols-split-from],[data-cols-split-to]');
}

/** A zero-size mark at the start of `holder`'s first line: its bottom is that line's baseline. */
function baselineOf(holder: HTMLElement): number | null {
  const mark = document.createElement('span');
  mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
  holder.insertBefore(mark, holder.firstChild);
  try {
    return mark.getClientRects().length ? mark.getBoundingClientRect().bottom : null;
  } finally {
    mark.remove();
  }
}

export interface GridStats {
  /** The pitch in px (0: the theme has no grid). */
  grid: number;
  /** Where the ruling sits in a line box, px from its top. */
  ruleAt: number;
  /** Blocks moved or grown to sit on the grid (placed, boxes grown, formulas aligned). */
  snapped: number;
  /** Ruled blocks marked off the grid. */
  offGrid: number;
}

export class BaselineGridHandler extends Handler {
  readonly stats: GridStats = { grid: -1, ruleAt: 0, snapped: 0, offGrid: 0 };
  /** The handler of the latest previewer (tests read it through the runtime's result). */
  static last: BaselineGridHandler | null = null;
  /** Where a body line's baseline falls in its line box (px). */
  private base = 0;
  /** The lined kinds' custom properties (`--orz-pt-h1` → `12.3px`, …), set on every page's text block. */
  private vars: Array<[string, string]> = [];

  constructor(chunker: unknown, polisher: unknown, caller: unknown) {
    super(chunker, polisher, caller);
    BaselineGridHandler.last = this;
  }

  /** Measure the pitch and the baseline once, on a probe paragraph inside the page's document body; then the lined kinds. */
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
      this.base = baseline;
      this.stats.ruleAt = Math.min(grid - 1, baseline + Math.max(1, 0.08 * em));
    } finally {
      probe.remove();
    }
    this.measureLined(body);
  }

  /**
   * Each lined kind on a probe (one line, its top on a grid line, unshifted): its first baseline `b`, its height
   * `h` and padding-bottom `pb`. The shift (`position: relative; top`) that puts the baseline on a rule (at the
   * body's height in a line: the rule `ruleAt - base` under it) is the nearest of `(base - b) mod grid` and that
   * minus a line; the margin-bottom that ends the block at the end of its last line's line box, plus its own
   * trailing blank (`pb`), is `b + shift + (grid - base) + pb - h`. A kind whose leading is not a whole number
   * of lines gets neither (it is checked when complete, like text).
   */
  private measureLined(body: HTMLElement): void {
    const { grid } = this.stats;
    const vars: Array<[string, string]> = [];
    const px = (n: number): string => `${Math.round(n * 100) / 100}px`;
    for (const k of LINED) {
      const host = document.createElement('div');
      host.innerHTML = k.html;
      const el = host.firstElementChild as HTMLElement;
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;width:30em;margin:0;transform:none;';
      body.appendChild(el);
      try {
        let holder: HTMLElement = el;
        while (holder.firstElementChild) holder = holder.firstElementChild as HTMLElement;
        holder.style.setProperty('top', '0px'); // unshifted (the shift is what is measured)
        const top = el.getBoundingClientRect().top;
        const baseline = baselineOf(holder);
        if (baseline === null) continue;
        const b = baseline - top;
        const h = el.getBoundingClientRect().height;
        const pb = parseFloat(getComputedStyle(el).paddingBottom) || 0;
        const lh = parseFloat(getComputedStyle(holder).lineHeight);
        if (!(lh > 0) || Math.abs(lh / grid - Math.round(lh / grid)) * grid > EPS) continue; // leading off the grid
        const d = mod(this.base - b, grid);
        const shift = d > grid / 2 ? d - grid : d;
        vars.push(
          [`--orz-sh-${k.id}`, px(shift)],
          [`--orz-mb-${k.id}`, px(b + shift + (grid - this.base) + pb - h)],
        );
      } finally {
        el.remove();
      }
    }
    this.vars = vars;
  }

  renderNode(clone: Node, _node: Node, layout: { element: HTMLElement }): void {
    if (!isEl(clone)) return;
    const body = clone.parentElement;
    if (!body || !body.classList.contains('markdown-body')) return;
    this.measure(body);
    if (!this.stats.grid) return;
    for (const [name, value] of this.vars) if (body.style.getPropertyValue(name) !== value) body.style.setProperty(name, value);
    if (clone.tagName === 'P' && isImageOnly(clone)) clone.classList.add(PICTURE_CLASS);
    const cs = getComputedStyle(clone);
    if (cs.position === 'absolute' || cs.position === 'fixed' || cs.float !== 'none') return;
    let prev = clone.previousElementSibling as HTMLElement | null;
    while (prev && !inFlow(prev)) prev = prev.previousElementSibling as HTMLElement | null;
    if (prev) this.complete(prev, layout.element);
    this.place(clone, prev, layout.element);
  }

  /** A complete block: a formula aligned, a box grown to a rule, a ruled block off the grid marked. */
  private complete(el: HTMLElement, area: HTMLElement): void {
    if (el.hasAttribute(DONE) || el.classList.contains(OFF_GRID_CLASS) || isFragment(el)) return;
    const kind = kindOf(el);
    if (kind === 'math') this.alignMath(el, area);
    else if (kind === 'box') this.grow(el, area);
    else this.checkLines(el, kind);
  }

  /** Mark a complete ruled block whose height (with its bottom margin, for a lined one) is not a whole number of lines. */
  private checkLines(el: HTMLElement, kind: Kind): void {
    const grid = this.stats.grid;
    const extra = kind === 'lined' ? parseFloat(getComputedStyle(el).marginBottom) || 0 : 0;
    const lines = (layoutRect(el).height + extra) / grid;
    if (Math.abs(lines - Math.round(lines)) * grid > EPS) {
      el.classList.add(OFF_GRID_CLASS);
      this.stats.offGrid++;
    }
  }

  /** The smallest rule position at or after `y` (px from the content box top). */
  private ruleAtOrAfter(y: number): number {
    const { grid, ruleAt } = this.stats;
    return ruleAt + Math.ceil((y - ruleAt - EPS) / grid) * grid;
  }

  /**
   * A complete box ends on a rule: its padding-bottom grows by what is missing (a table: its height, which its
   * rows share; columns: each column's sheet). Never past the content box bottom (Paged.js would then split a box
   * that fitted): such a box is left as it is — nothing else fits under it on this page.
   */
  private grow(el: HTMLElement, area: HTMLElement): void {
    const a = area.getBoundingClientRect();
    const sheets = el.classList.contains('cols') ? (Array.from(el.children) as HTMLElement[]).filter((c) => c.classList.contains('col')) : [el];
    let grown = false;
    for (const s of sheets) {
      const r = layoutRect(s);
      if (r.height === 0 || r.left >= a.right - 1) continue;
      const bottom = r.bottom - a.top;
      const add = this.ruleAtOrAfter(bottom) - bottom;
      if (add <= EPS) continue;
      if (layoutRect(el).bottom - a.top + add > a.height + EPS) continue;
      if (s.tagName === 'TABLE') s.style.height = `${r.height + add}px`;
      else s.style.paddingBottom = `${(parseFloat(getComputedStyle(s).paddingBottom) || 0) + add}px`;
      grown = true;
    }
    el.setAttribute(DONE, '');
    if (grown) this.stats.snapped++;
  }

  /**
   * A complete display formula sits on the lines: its baseline moved onto a rule (a relative shift of at most
   * half a line, never up into the block above), its height rounded up to whole lines (padding-bottom); the
   * theme gives it one blank line after (margin-bottom). One that would then run past the content box is left
   * as it is and hides the ruling (off the grid).
   */
  private alignMath(el: HTMLElement, area: HTMLElement): void {
    const { grid } = this.stats;
    const a = area.getBoundingClientRect();
    const r = layoutRect(el);
    if (r.height === 0 || r.left >= a.right - 1) return;
    const html = el.querySelector<HTMLElement>('.katex-display > .katex > .katex-html') ?? el.querySelector<HTMLElement>('.katex-display') ?? el;
    const ink = html.getBoundingClientRect();
    const baseline = baselineOf(html);
    if (baseline === null) return;
    const d = mod(this.base - (baseline - a.top), grid);
    let shift = d > grid / 2 ? d - grid : d;
    if (ink.top + shift < r.top - EPS) shift += grid;
    const pb0 = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    const top = r.top - a.top;
    const bottom = Math.max(ink.bottom - a.top + shift, r.bottom - a.top - pb0);
    const end = top + Math.max(1, Math.ceil((bottom - top - EPS) / grid)) * grid; // a grid line: the block's new bottom
    const mb = Math.max(0, parseFloat(getComputedStyle(el).marginBottom) || 0);
    if (end + mb > a.height + EPS) {
      el.classList.add(OFF_GRID_CLASS);
      this.stats.offGrid++;
      return;
    }
    el.style.position = 'relative';
    el.style.top = `${Math.round(shift * 100) / 100}px`;
    el.style.paddingBottom = `${Math.max(0, pb0 + end - (r.bottom - a.top))}px`;
    el.setAttribute(DONE, '');
    this.stats.snapped++;
  }

  /**
   * Put the block just appended (`el`, its top already final: the margins above it are laid out) on the grid —
   * a text, lined or math block on a grid line (the gap above it grows), a box on a rule one line under what is
   * above it (the gap may also shrink: a paragraph's own trailing blank line is the line the box starts on) —
   * by setting the previous block's bottom margin (the whole collapsed gap), or, for the first block on the
   * page, its own top margin (it only grows).
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
    const prevBox = !!prev && kindOf(prev) === 'box';
    let delta: number;
    if (prev && kindOf(el) === 'box' && !el.hasAttribute('data-split-from')) {
      const p = layoutRect(prev);
      const pcs = getComputedStyle(prev);
      const mb = parseFloat(pcs.marginBottom) || 0;
      // where the block above ends: its last line (a paragraph's trailing blank line not counted); the
      // sheet starts on a rule with one blank line between (after another sheet: one line between)
      const blank = !prevBox && Math.abs((parseFloat(pcs.paddingBottom) || 0) - grid) <= EPS ? grid : 0;
      const end = p.bottom - a.top + Math.min(0, mb) - blank;
      delta = this.ruleAtOrAfter(end + 1) + (prevBox ? 0 : grid) - top;
    } else {
      // on the next grid line; after a sheet, one blank line between
      const rem = mod(top, grid);
      const onLine = rem <= EPS || grid - rem <= EPS;
      delta = (onLine ? 0 : grid - rem) + (prevBox && !el.hasAttribute('data-split-from') ? grid : 0);
    }
    if (Math.abs(delta) <= EPS) return;
    if (prev) {
      const gap = r.top - layoutRect(prev).bottom;
      const prevMb = parseFloat(getComputedStyle(prev).marginBottom) || 0;
      if (delta > 0 && gap >= 0 && prevMb >= 0) {
        prev.style.marginBottom = `${gap + delta}px`;
      } else {
        // the collapsed gap becomes `target`: with this block's top margin `mt`, a bottom margin `x` gives
        // max(x, mt) (both >= 0), x + mt (one negative) or min(x, mt) (both negative)
        const target = gap + delta;
        const mt = parseFloat(getComputedStyle(el).marginTop) || 0;
        const x = mt >= 0 ? (target >= mt ? target : target - mt) : (target - mt >= 0 ? target - mt : target);
        prev.style.marginBottom = `${x}px`;
      }
    } else {
      if (delta < 0) return;
      el.style.marginTop = `${(parseFloat(getComputedStyle(el).marginTop) || 0) + delta}px`;
    }
    this.stats.snapped++;
  }

  afterPageLayout(page: HTMLElement): void {
    if (!this.stats.grid) return;
    page.style.setProperty('--orz-rule-at', `${Math.round(this.stats.ruleAt * 100) / 100}px`);
    // the last block on the page is complete now (nothing was appended after it here)
    const area = page.querySelector<HTMLElement>('.pagedjs_page_content');
    const body = area?.querySelector<HTMLElement>('.markdown-body');
    if (!area || !body) return;
    let last = body.lastElementChild as HTMLElement | null;
    while (last && !inFlow(last)) last = last.previousElementSibling as HTMLElement | null;
    if (last && kindOf(last) !== 'text' && kindOf(last) !== 'lined') this.complete(last, area);
  }
}
