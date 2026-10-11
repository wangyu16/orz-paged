/**
 * Code across page breaks (closed loop round 3): two UPSTREAM Paged.js 0.4.3
 * faults with long code blocks, worked around here. Browser only (DOM),
 * registered by the paged runtime (src/paged/runtime.ts).
 *
 * 1. **Text nodes of code** ({@link keepCodeWhitespace}): two faults.
 *    (a) Paged.js deep-clones an inline element (a highlight.js token
 *    `<span>`) and continues its walk at the next *significant* node
 *    (`nodeAfter` → `nextSignificantNode`), so a whitespace-only text node
 *    right after it — the newline and indentation between two tokens — is
 *    skipped: on every page that continued a highlighted fence the lines ran
 *    together (closed loop round 3). (b) Where a page breaks inside a text
 *    node, Paged.js finds that node in the source BY ITS CONTENT
 *    (`indexOfTextNode`: the first sibling text node that *includes* the
 *    rendered one), so among sibling text nodes it can pick an earlier one
 *    with the same text — and real highlighted code is full of them (the
 *    `\n    state[` between two tokens repeats on every line): with the real
 *    highlight.js a long fence repeated or skipped lines, Paged.js reported
 *    "Layout repeated" and everything after the fence was lost (closed loop
 *    round 4). Every text node inside `pre` / `code` that shares its parent
 *    with another node is wrapped in its own `<span data-orz-ws>` on the
 *    stage, before the layout: no element is skipped, each text node is its
 *    parent's only child (found unambiguously), and the text is the same.
 *    (c) Inside one text node Paged.js finds the rest of a broken node by
 *    `indexOf`: periodic text (identical lines in a plain fence) matched an
 *    earlier line (closed loop round 5) — a `pre`'s text is split into one
 *    span per line, so a break at a line start falls at an element.
 * 2. **A code line cut through at the page bottom** ({@link CodeBreakHandler}):
 *    Paged.js breaks a text node at the first word whose TOP is below the
 *    page area, so a line that starts above the bottom but ends below it
 *    stays on the page, clipped by the `pre`'s overflow (a page-tall plain
 *    fence over-ran the area by 9–21 px, F4). In `onOverflow`, when the
 *    break falls in a text node inside a `pre`, the break moves back to the
 *    start of the first line whose glyphs end below the area: that line opens
 *    the next page instead.
 */
import { Handler } from 'pagedjs';

/** The attribute of a text node of code wrapped in its own span. */
export const CODE_SPACE_ATTRIBUTE = 'data-orz-ws';

/**
 * Wrap every text node inside `pre` / `code` of `root` that is not already
 * its parent element's only child (the block itself never counts as such a
 * parent) in a `<span data-orz-ws>`; returns how many.
 */
export function keepCodeWhitespace(root: ParentNode): number {
  let n = 0;
  for (const block of Array.from(root.querySelectorAll('pre, code'))) {
    if (block.tagName === 'CODE' && block.parentElement?.closest('pre')) continue; // a fence's code: its pre walks it
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const spaces: Text[] = [];
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const s = t as Text;
      const parent = s.parentElement;
      if (s.data === '' || !parent || parent.hasAttribute(CODE_SPACE_ATTRIBUTE)) continue;
      // alone in a token span (or in the fence's `code`): found unambiguously already
      if (parent !== block && parent.childNodes.length === 1) continue;
      spaces.push(s);
    }
    for (const s of spaces) {
      const span = document.createElement('span');
      span.setAttribute(CODE_SPACE_ATTRIBUTE, '');
      s.replaceWith(span);
      span.append(s);
      n++;
    }
    if (block.tagName === 'PRE') n += splitLines(block);
  }
  return n;
}

/**
 * Every text node of a `pre` that holds more than one line is split at its
 * newlines, one `<span data-orz-ws>` per line (each line its parent's only
 * text), so that a page break, which the code-break handler puts at a line
 * start, falls at the start of an element (closed loop round 5): Paged.js
 * locates the rest of a broken text node by `indexOf` of the rendered rest
 * inside it, and in periodic text — a matrix of `0 0 0` rows, an ASCII grid,
 * a run of identical `}` lines in a plain fence (one text node) — that is an
 * earlier line: lines repeated or lost, "Layout repeated", the rest of the
 * document gone. Returns how many spans it made.
 */
function splitLines(pre: Element): number {
  let n = 0;
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const d = (t as Text).data;
    const nl = d.indexOf('\n');
    if (nl >= 0 && nl < d.length - 1) texts.push(t as Text);
  }
  for (const t of texts) {
    const parts = t.data.match(/[^\n]*\n|[^\n]+$/g) ?? [t.data];
    const spans = parts.map((part) => {
      const span = document.createElement('span');
      span.setAttribute(CODE_SPACE_ATTRIBUTE, '');
      span.textContent = part;
      return span;
    });
    t.replaceWith(...spans);
    n += spans.length;
  }
  return n;
}

/**
 * The same fault outside code (closed loop round 4): a paragraph whose text
 * between inline elements repeats — "… with inline math $a$. … with inline
 * math $b$." — has sibling text nodes Paged.js cannot tell apart where a page
 * breaks inside one (`indexOfTextNode` takes the first sibling that includes
 * it): the continuation repeated or skipped text and everything after could
 * be lost. A text node (not whitespace only) that an EARLIER sibling text
 * node includes is wrapped in its own `<span data-orz-ws>` (only those: most
 * text is untouched).
 * Returns how many.
 */
export function disambiguateTextNodes(root: ParentNode): number {
  let n = 0;
  const parents = new Set<Element>();
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.parentElement && t.parentElement.tagName !== 'PRE' && !t.parentElement.closest('pre')) parents.add(t.parentElement);
  for (const parent of parents) {
    // (whitespace-only text is never a break point that matters, and a span made of it would be a box: a grid's
    // newlines between its cells would become cells)
    const texts = Array.from(parent.childNodes).filter((c): c is Text => c.nodeType === 3 && /[^\t\n\r ]/.test((c as Text).data));
    if (texts.length < 2) continue;
    for (let i = 1; i < texts.length; i++) {
      const t = texts[i]!;
      if (!texts.slice(0, i).some((e) => e.data.includes(t.data))) continue;
      const span = document.createElement('span');
      span.setAttribute(CODE_SPACE_ATTRIBUTE, '');
      t.replaceWith(span);
      span.append(t);
      n++;
    }
  }
  return n;
}

const charRect = (t: Text, i: number): DOMRect | null => {
  const r = document.createRange();
  r.setStart(t, i);
  r.setEnd(t, i + 1);
  const rs = Array.from(r.getClientRects()).filter((x) => x.height > 0);
  return rs.length ? rs[rs.length - 1]! : null;
};

/**
 * A pre's line height in px (0: `normal`, the glyph box is the line): its lines' — the fence's `code` when that is
 * a block of its own (a theme gives the code its line height, not the pre: round 5, the pre's was not its lines').
 */
function lineHeightOf(pre: Element): number {
  const code = pre.querySelector(':scope > code');
  const lines = code && getComputedStyle(code).display !== 'inline' ? code : pre;
  const lh = parseFloat(getComputedStyle(lines).lineHeight);
  return Number.isFinite(lh) ? lh : 0;
}

/** The text nodes of `pre`, in order. */
function textsOf(pre: Element): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) out.push(t as Text);
  return out;
}

/**
 * Where the overflow of a `pre` should start, given Paged.js' break point
 * (`node`, `offset`) inside it and the page area's bottom: the start of the
 * first line before the break (measured by its glyphs; a blank line by its
 * newline or spaces) whose line box ends below `bottom` — right after the
 * previous line's newline — or null when the break is right.
 */
export function codeBreakPoint(pre: Element, node: Node, offset: number, bottom: number, lineHeight = 0): { node: Text; offset: number } | null {
  const texts = textsOf(pre);
  if (!texts.length) return null;
  // the break as (text index, char offset): the first text at or after the point
  let ti: number;
  let ci: number;
  if (node.nodeType === 3) {
    ti = texts.indexOf(node as Text);
    ci = offset;
  } else if (node === pre && offset >= pre.childNodes.length) {
    ti = texts.length - 1; // the end of the pre
    ci = texts[ti]!.data.length;
  } else {
    const after = node.childNodes[offset] ?? null;
    ti = texts.findIndex((t) => (after ? (after === t || after.contains(t) || !!(after.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)) : false));
    if (after === null) {
      // the point is at the end of `node`: the first text after it
      ti = texts.findIndex((t) => !node.contains(t) && !!(node.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING));
    }
    ci = 0;
  }
  if (ti < 0) return null;
  // the pre's text as one string: a blank line (empty, or only spaces) has no glyph, but its box is a line all the
  // same — at a page bottom it ended below the area like any line (closed loop round 4)
  const base: number[] = [];
  let full = '';
  for (const t of texts) { base.push(full.length); full += t.data; }
  const blank = new Map<number, boolean>();
  const onBlankLine = (g: number): boolean => {
    const start = full.lastIndexOf('\n', g - 1) + 1;
    let v = blank.get(start);
    if (v === undefined) {
      const end = full.indexOf('\n', start);
      v = !/[^\t\r ]/.test(full.slice(start, end < 0 ? full.length : end));
      blank.set(start, v);
    }
    return v;
  };
  // step back over the glyphs (and blank lines) before the break while they end below the area
  let at: { t: number; c: number } | null = null;
  // (no step cap: the walk ends at the first line above the area — a cap of 4000 characters left a long fence's
  // last lines below the area; closed loop round 4)
  outer: for (let k = ti; k >= 0; k--) {
    const t = texts[k]!;
    for (let i = (k === ti ? ci : t.data.length) - 1; i >= 0; i--) {
      // the whitespace of a line with glyphs is measured by its glyphs
      if (/\s/.test(t.data[i]!) && !onBlankLine(base[k]! + i)) continue;
      const r = charRect(t, i);
      if (!r) continue;
      // the line box reaches half the leading below the glyphs
      if (r.bottom + Math.max(0, (lineHeight - r.height) / 2) <= bottom + 0.5) break outer;
      at = { t: k, c: i };
    }
  }
  if (!at) {
    // the line fits: still break at its start, never after its indentation (the spaces would make an empty line at
    // the page bottom — 21 px below the area — and the next page's first line would lose its indentation)
    for (let k = ti; k >= 0; k--) {
      const t = texts[k]!;
      for (let i = (k === ti ? ci : t.data.length) - 1; i >= 0; i--) {
        const ch = t.data[i]!;
        if (ch === ' ' || ch === '\t') continue;
        if (ch !== '\n') return null;
        if (k === ti && i === ci - 1) return null; // right after the newline already
        return i + 1 < t.data.length ? { node: t, offset: i + 1 } : (texts[k + 1] ? { node: texts[k + 1]!, offset: 0 } : null);
      }
    }
    return null;
  }
  // open the line: the character after the line's newline (its indentation goes with it)
  for (let k = at.t; k >= 0; k--) {
    const t = texts[k]!;
    // (before the line's first character: `lastIndexOf` at -1 would find a newline AT 0 — the line's own end when the
    // line is a blank one alone in its text node, one span per line since round 5)
    const from = (k === at.t ? at.c : t.data.length) - 1;
    if (from < 0) continue;
    const nl = t.data.lastIndexOf('\n', from);
    if (nl >= 0) {
      if (nl + 1 < t.data.length) return { node: t, offset: nl + 1 };
      // the newline ends its text node: the line opens at the next text
      const nx = texts[k + 1];
      return nx ? { node: nx, offset: 0 } : null;
    }
  }
  return null; // the pre's first line: Paged.js' own break
}

/** The Paged.js handler of a code line cut through at the page bottom (see the module comment). */
export class CodeBreakHandler extends Handler {
  /** Breaks moved back to a line start (tests read it). */
  static moved = 0;

  onOverflow(overflow: Range | undefined, rendered: Element, bounds: DOMRect): Range | undefined {
    let pre: Element | null = null;
    let node: Node | null = null;
    let offset = 0;
    if (overflow) {
      const start = overflow.startContainer;
      pre = (start.nodeType === 1 ? (start as Element) : start.parentElement)?.closest('pre') ?? null;
      if (pre && !rendered.contains(pre)) pre = null;
      if (pre) { node = start; offset = overflow.startOffset; }
    }
    if (!pre) {
      // a fence that ENDS on this page with its last lines' boxes (half-leading, the pre's bottom padding and border)
      // below the area: Paged.js found every glyph above the bottom and broke after the pre (F4)
      const pres = Array.from(rendered.querySelectorAll('pre')).filter((p) => p.getBoundingClientRect().bottom > bounds.bottom + 0.5 && (!overflow || overflow.comparePoint(p, 0) < 0));
      pre = pres[pres.length - 1] ?? null;
      if (!pre || pre.parentElement?.closest('pre')) return undefined;
      node = pre;
      offset = pre.childNodes.length;
    }
    // the fragment's boxes must end inside the area too: what the pre and its code draw below the last line (their
    // bottom border; their bottom padding only when the pre ends here — Paged.js unsets it on a fragment that
    // continues, `[data-split-to]`) and the line box's half-leading under the glyphs
    const ends = node === pre && offset >= pre.childNodes.length;
    let below = 0;
    for (let e: Element | null = node!.nodeType === 1 ? (node as Element) : node!.parentElement; e; e = e === pre ? null : e.parentElement) {
      const cs = getComputedStyle(e);
      if (e === pre || cs.display !== 'inline') below += (ends ? parseFloat(cs.paddingBottom) || 0 : 0) + (parseFloat(cs.borderBottomWidth) || 0);
    }
    const p = codeBreakPoint(pre, node!, offset, Math.floor(bounds.bottom - below) - 1, lineHeightOf(pre));
    if (!p) return undefined;
    const r = document.createRange();
    if (p.offset === 0) r.setStartBefore(p.node.parentElement && p.node.parentElement !== pre && p.node.parentElement.tagName === 'SPAN' && p.node.parentElement.firstChild === p.node ? p.node.parentElement : p.node);
    else r.setStart(p.node, p.offset);
    if (overflow && r.compareBoundaryPoints(Range.START_TO_START, overflow) >= 0) return undefined; // not earlier: as it is
    if (overflow) r.setEnd(overflow.endContainer, overflow.endOffset);
    else r.setEndAfter(rendered.lastChild!);
    CodeBreakHandler.moved++;
    return r;
  }
}
