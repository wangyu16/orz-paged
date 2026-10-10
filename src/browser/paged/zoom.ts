/**
 * KIND-SPECIFIC (paged): the reader's page zoom (REBUILD §3b decision 6) — a
 * reader preference (FC-18 §6: stored per browser by the document's `uid`,
 * never in the text, never marking it unsaved), instead of orz-mdhtml's text
 * size, which would change the pagination. It scales the laid-out pages
 * (`--orz-page-zoom` on `#orz-pages`, CSS `zoom` on `.pagedjs_pages`); the
 * pagination is measured unscaled and printing ignores it.
 *
 * The kit offers it as a reader control with named choices
 * (`readerControls.choices`, key `pageZoom`, src/browser/paged/kind.ts): it
 * stores the choice per uid and calls the read view's `setZoom`.
 */

/** The reader's page zoom: `auto` (the default: 100 %, shrunk to fit a narrow window), fit width, 100 %, 125 %. */
export type PageZoom = 'auto' | 'fit' | '100' | '125';

/** The choices the reader is offered, `auto` first (the default: "100%" until the window is narrower than a page). */
export const PAGE_ZOOMS: ReadonlyArray<{ id: PageZoom; label: string }> = Object.freeze([
  { id: 'auto', label: 'Automatic' },
  { id: 'fit', label: 'Fit width' },
  { id: '100', label: '100%' },
  { id: '125', label: '125%' },
]);

/** True for a page zoom id. */
export const isPageZoom = (v: unknown): v is PageZoom => v === 'auto' || v === 'fit' || v === '100' || v === '125';

/** The scale a zoom choice gives pages `pageWidth` wide in a window `avail` wide. */
export function zoomScale(zoom: PageZoom, pageWidth: number, avail: number): number {
  const fit = pageWidth > 0 && avail > 0 ? avail / pageWidth : 1;
  switch (zoom) {
    case 'fit': return Math.max(0.25, Math.min(4, fit));
    case '100': return 1;
    case '125': return 1.25;
    default: return Math.max(0.25, Math.min(1, fit));
  }
}

/** Apply a zoom to the pages in `container` (`--orz-page-zoom`). */
export function applyZoom(container: HTMLElement, zoom: PageZoom): number {
  const page = container.querySelector<HTMLElement>('.pagedjs_page');
  const now = Number(container.style.getPropertyValue('--orz-page-zoom')) || 1;
  // the page's unscaled width: its drawn width over the scale it is drawn at
  const w = page ? page.getBoundingClientRect().width / now : 0;
  const avail = (container.ownerDocument.documentElement.clientWidth || 0) - 32;
  const z = Math.round(zoomScale(zoom, w, avail) * 1000) / 1000;
  container.style.setProperty('--orz-page-zoom', String(z));
  container.setAttribute('data-orz-page-zoom', zoom);
  return z;
}
