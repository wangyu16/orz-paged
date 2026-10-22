/**
 * Copy as Markdown across pages (D-110). Browser only (DOM), installed by the
 * paged runtime (src/paged/runtime.ts) next to orz-markdown's copy handler.
 *
 * The kit's handler (orz-markdown's browser runtime, `data-orz-copy`) turns a
 * selection into Markdown with its `elementToMarkdown` walker. On laid-out
 * pages a selection that crosses a page break fails it twice: each page holds
 * its own clone of the document root (`main.orz-doc.markdown-body`, which the
 * walker reads as inline content: a fence copied as backtick-wrapped pieces),
 * and Paged.js splits a block over pages into fragments (a fence became one
 * fence per page). This handler, in the capture phase, takes only selections
 * whose ends lie on two different pages: it clones the selection, keeps each
 * page's content (never the running headers, footers or page numbers),
 * stitches every fragment back onto the one it continues (`data-split-from`
 * names the `data-ref` of the fragment before), drops the header rows a split
 * table repeats on its continuation pages (src/paged/table-head.ts), and
 * gives that one tree to the kit's walker — so a fence over four pages copies
 * as ONE fence with its language. A selection on one page is the kit's.
 */

/** The kit walker this handler hands the stitched tree to (`OrzMarkdownRuntime.elementToMarkdown`). */
export type ToMarkdown = (root: Element) => string;

const isBlank = (n: Node): boolean => n.nodeType === 3 ? !/\S/.test(n.nodeValue ?? '') : n.nodeType === 8;

/** The last node of `el` that is not blank text or a comment. */
function lastSignificant(el: Element): Node | null {
  for (let n = el.lastChild; n; n = n.previousSibling) if (!isBlank(n)) return n;
  return null;
}

/**
 * Append `from`'s children to `into`: a child element that continues the last
 * element of `into` (its `data-split-from` is that element's `data-ref`) is
 * merged into it, recursively; a table continuation's repeated `thead` is
 * dropped when `into` has one.
 */
export function appendStitched(into: Element, from: ParentNode): void {
  for (const child of Array.from(from.childNodes)) {
    if (child.nodeType === 1) {
      const el = child as Element;
      const last = lastSignificant(into);
      const split = el.getAttribute('data-split-from');
      if (split !== null && last !== null && last.nodeType === 1 && (last as Element).getAttribute('data-ref') === split && (last as Element).tagName === el.tagName) {
        appendStitched(last as Element, el);
        continue;
      }
      if (el.tagName === 'THEAD' && into.tagName === 'TABLE' && Array.from(into.children).some((c) => c.tagName === 'THEAD')) continue;
    }
    into.appendChild(child);
  }
}

/**
 * The content of a cloned run of pages as one tree: each page's document
 * root (`.orz-doc`, else its page content box), in order, stitched; the
 * page's margin boxes are left out.
 */
export function stitchPages(clone: ParentNode, doc: Document): HTMLElement {
  const out = doc.createElement('div');
  const pages = Array.from(clone.querySelectorAll('.pagedjs_page'));
  for (const page of pages) {
    const content = page.querySelector('.pagedjs_page_content');
    if (!content) continue;
    const roots = Array.from(content.querySelectorAll('.orz-doc')).filter((r) => !r.parentElement?.closest('.orz-doc'));
    for (const root of roots.length > 0 ? roots : [content]) appendStitched(out, root);
  }
  return out;
}

const pageOf = (n: Node | null): Element | null => {
  const el = n === null ? null : n.nodeType === 1 ? (n as Element) : n.parentElement;
  return el?.closest('.pagedjs_page') ?? null;
};

/** The copy handler of a document's pages (capture phase; one per document). */
export function crossPageCopy(doc: Document, toMarkdown: () => ToMarkdown | undefined): (e: ClipboardEvent) => void {
  return (e: ClipboardEvent): void => {
    const sel = doc.getSelection();
    if (!sel || sel.rangeCount !== 1 || sel.isCollapsed || !e.clipboardData) return;
    const range = sel.getRangeAt(0);
    const a = pageOf(range.startContainer);
    const b = pageOf(range.endContainer);
    if (!a || !b || a === b) return; // one page (or not the pages): the kit's copy
    const root = a.closest('[data-orz-copy]');
    if (!root || !root.contains(b)) return;
    const md = toMarkdown();
    if (!md) return;
    const holder = doc.createElement('div');
    holder.appendChild(range.cloneContents());
    // the pages the range cuts are cloned with their ancestors (.pagedjs_page down to the selected text)
    let text: string;
    try {
      const stitched = stitchPages(holder, doc);
      // inside one code block (both ends in fragments of one fence): its text exactly as shown, as the kit copies a
      // selection inside one block on a page — a command copied from a code block pastes as the command
      const preA = (range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement)?.closest('pre');
      const preB = (range.endContainer.nodeType === 1 ? range.endContainer as Element : range.endContainer.parentElement)?.closest('pre');
      const ref = preA?.getAttribute('data-ref');
      text = ref && preB?.getAttribute('data-ref') === ref ? stitched.textContent ?? '' : md(stitched);
    } catch { return; }
    if (!text.trim()) return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    e.stopImmediatePropagation(); // the kit's handler (on the document, bubbling) would copy the pieces
  };
}

const INSTALLED = new WeakSet<Document>();

/** Install {@link crossPageCopy} on a document once. */
export function installCrossPageCopy(doc: Document, toMarkdown: () => ToMarkdown | undefined): void {
  if (INSTALLED.has(doc)) return;
  INSTALLED.add(doc);
  doc.addEventListener('copy', crossPageCopy(doc, toMarkdown), true);
}
