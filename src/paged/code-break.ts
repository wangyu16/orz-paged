/**
 * Code across page breaks (closed loop round 3): two UPSTREAM Paged.js 0.4.3
 * faults with long code blocks, worked around here. Browser only (DOM),
 * registered by the paged runtime (src/paged/runtime.ts).
 *
 * 1. **Whitespace between highlight tokens** ({@link keepCodeWhitespace}):
 *    Paged.js deep-clones an inline element (a highlight.js token `<span>`)
 *    and continues its walk at the next *significant* node (`nodeAfter` →
 *    `nextSignificantNode`), so a whitespace-only text node right after it —
 *    the newline and indentation between two tokens — is skipped. On every
 *    page that continued a highlighted fence the lines ran together (a
 *    300-line Python fence lost lines 51–300 off the page area). Each
 *    whitespace-only text node inside `pre` or `code` is wrapped in a
 *    `<span data-orz-ws>` on the stage, before the layout: an element is never
 *    skipped, and the text is the same.
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

/** The attribute of a whitespace-only text node of code wrapped in a span. */
export const CODE_SPACE_ATTRIBUTE = 'data-orz-ws';

/** Wrap every whitespace-only text node inside `pre` / `code` of `root` in a `<span data-orz-ws>`; returns how many. */
export function keepCodeWhitespace(root: ParentNode): number {
  let n = 0;
  for (const block of Array.from(root.querySelectorAll('pre, code'))) {
    if (block.tagName === 'CODE' && block.parentElement?.closest('pre')) continue; // a fence's code: its pre walks it
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const spaces: Text[] = [];
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const s = t as Text;
      if (s.data !== '' && !/[^\t\n\r ]/.test(s.data) && !s.parentElement?.hasAttribute(CODE_SPACE_ATTRIBUTE)) spaces.push(s);
    }
    for (const s of spaces) {
      const span = document.createElement('span');
      span.setAttribute(CODE_SPACE_ATTRIBUTE, '');
      s.replaceWith(span);
      span.append(s);
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

/** A pre's line height in px (0: `normal`, the glyph box is the line). */
function lineHeightOf(pre: Element): number {
  const lh = parseFloat(getComputedStyle(pre).lineHeight);
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
 * first line (of non-space glyphs before the break) that ends below `bottom`
 * — right after that line's newline — or null when the break is right.
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
  // step back over the glyphs before the break while they end below the area
  let at: { t: number; c: number } | null = null;
  let steps = 0;
  outer: for (let k = ti; k >= 0; k--) {
    const t = texts[k]!;
    for (let i = (k === ti ? ci : t.data.length) - 1; i >= 0; i--) {
      if (++steps > 4000) break outer;
      if (/\s/.test(t.data[i]!)) continue;
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
    const nl = t.data.lastIndexOf('\n', (k === at.t ? at.c : t.data.length) - 1);
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
