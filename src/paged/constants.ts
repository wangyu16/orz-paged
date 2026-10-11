/**
 * The paged runtime's constants that other modules and the tests read without
 * loading the runtime itself (it needs a DOM): its waits and the "updating…"
 * mark's attribute. The runtime (src/paged/runtime.ts) re-exports them.
 */

/**
 * How long a layout waits for the content's fonts, stylesheets, libraries
 * (enhancement) and images before it lays out the pages with what has
 * arrived (fallback fonts, unenhanced content): a slow or hanging CDN never
 * keeps the page blank (R.6).
 */
export const FIRST_WAIT_MS = 2000;
/** How long the late assets are awaited for the one re-flow after a provisional layout (and Print, which waits for it). */
export const LATE_WAIT_MS = 20_000;
/** How long the re-flow itself waits (its assets were awaited for up to LATE_WAIT_MS already): a fresh stage's fonts and images from cache. */
export const FINAL_WAIT_MS = 1000;

/**
 * The kit's wait for the frame's first acknowledgement is this plus a
 * second (`firstAckWaitMs`). The frame acknowledges each render as soon as
 * it has taken it (closed loop round 3; within this before): the kit paces
 * renders by the renderer alone, the pagination runs on in the frame, and a
 * newer render or an edit abandons it at its next page.
 */
export const PREVIEW_ACK_MS = 1000;

/**
 * The editor preview's pause in typing before a render (the kit's
 * `debounceMs`): short, now that a layout starts at the page the edit
 * changed and a stale one is abandoned at its next page (closed loop round 3;
 * 1.5 s before).
 */
export const PREVIEW_DEBOUNCE_MS = 800;

/**
 * How long the preview waits, after an edit abandoned its layout and no newer
 * render came, with no further edit, before it lays the same text out again
 * (closed loop round 4): an edit undone — a key typed and deleted — returns
 * the editor to the text last rendered, the kit sends no render for it (the
 * same text), and the preview stayed half old pages, half new ones,
 * "updating…" for good. Longer than the kit's pause before a render plus a
 * render, so a real newer text arrives first.
 */
export const PREVIEW_RETRY_MS = PREVIEW_DEBOUNCE_MS + 1700;

/**
 * The attribute the pages' root carries while what it shows is not yet the
 * final layout of the latest text (the read view re-laying out, the editor
 * preview behind the editor's text): the view's CSS draws a quiet
 * "updating…" mark from it (closed loop round 2, M3/L3).
 */
export const UPDATING_ATTRIBUTE = 'data-orz-updating';

/**
 * The attribute a pages root carries while a layout runs IN it (a first
 * layout, laid out straight into view): its page zoom stays 100 % until the
 * layout ends — a zoom applied meanwhile (the read view's page zoom, the
 * editor preview's fit to its pane) changed the pagination of every page
 * after the first (closed loop round 4: a 700 px window printed other pages
 * than a wide one). Zoom and fit wait for the layout to end.
 */
export const LAYING_OUT_ATTRIBUTE = 'data-orz-laying-out';

/** The "updating…" mark of a pages root, with `aria-busy` (assistive technology waits for the final pages). */
export function markUpdating(el: Element, on: boolean): void {
  if (on) {
    el.setAttribute(UPDATING_ATTRIBUTE, '');
    el.setAttribute('aria-busy', 'true');
  } else {
    el.removeAttribute(UPDATING_ATTRIBUTE);
    el.removeAttribute('aria-busy');
  }
}
