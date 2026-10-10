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
 * At most this long the editor's render waits for the frame's pagination
 * (its acknowledgement): the kit paces the next render by twice that time,
 * so a long document's layout must not hold the preview back for tens of
 * seconds (closed loop round 2, M3); the pagination itself runs on, and a
 * newer render or an edit abandons it.
 */
export const PREVIEW_ACK_MS = 1000;

/**
 * The attribute the pages' root carries while what it shows is not yet the
 * final layout of the latest text (the read view re-laying out, the editor
 * preview behind the editor's text): the view's CSS draws a quiet
 * "updating…" mark from it (closed loop round 2, M3/L3).
 */
export const UPDATING_ATTRIBUTE = 'data-orz-updating';
