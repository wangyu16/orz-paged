/**
 * KIND-SPECIFIC (paged): the editor preview — Paged.js pages in the kit
 * editor's sandboxed frame (FC-19 §8.4 pluggable preview).
 *
 * - `frameDocument(parts)`: the frame document — the kit's bridge first in
 *   `<head>` (it carries the frame's secret), then the paged runtime (the
 *   same script the read view runs: Paged.js, the two-column handler,
 *   enhancement), nonce-stamped, then the presentation's head (webfonts) and
 *   the frame's layout CSS, then `<article id="orz-doc">` the pages go into.
 *   No library scripts (`assets: false`): the runtime loads what the content
 *   needs, nonce-stamped.
 * - The renderer (src/browser/paged/render.ts `renderPagedPreview`) posts the
 *   body HTML plus the runtime's input as JSON; the runtime's
 *   `window.__orzPreviewApply` (the default bridge's page hook) paginates it
 *   into `#orz-doc`, double-buffered, and returns a promise — the bridge
 *   acknowledges the render when it settles, so the shell paces renders by
 *   the frame (a slow reflow is never overrun: the next render waits).
 * - `diff: false`: every render replaces the pages whole, keeping the scroll
 *   position (Paged.js reflows everything).
 * - Scroll sync: the blocks keep their `data-src-line` anchors inside the
 *   pages (Paged.js copies attributes), so the kit's anchor mapping maps a
 *   line to its place on its page.
 * - While the pages are not the editor's text (an edit since, a layout
 *   running) they carry a quiet "updating…" mark (`data-orz-updating`).
 * - The pages are scaled to the pane's width (never above 100 %); the
 *   preview does not print (REBUILD §3b decision 5) and does not follow the
 *   reader's page zoom.
 */
import type { PreviewFrameParts } from 'orz-markdown/carrier/editor';
import { escapeAttr } from 'orz-markdown/carrier/read';
import { previewPresentation, presentationOf } from '../../presentation.js';
import { PAGED_RUNTIME } from '../runtime-source.js';

/** The frame's layout: the grey desk, the pages centred with a shadow, scaled to the pane. */
export const PREVIEW_FRAME_CSS = `
html { background: #e8e9ed; scroll-behavior: auto; }
body { margin: 0 !important; padding: 0 !important; }
#orz-doc { display: block; margin: 0; padding: 0; min-height: 100vh; overflow-anchor: none; }
#orz-doc .pagedjs_pages { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 12px 0 48px; zoom: var(--orz-page-zoom, 1); }
:where(#orz-doc) .pagedjs_page { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 4px 14px rgba(0,0,0,.10); }
#orz-doc[data-orz-updating]::before { content: "updating\\2026"; position: fixed; top: 8px; left: 10px; z-index: 5; font: 12px/1.6 system-ui, sans-serif; color: #5b616e; background: rgba(255,255,255,.85); padding: 0 8px; border-radius: 9px; pointer-events: none; }
`;

/** FC-19 §8.4 `preview.frameDocument` for the paged preview. */
export function pagedFrameDocument(parts: PreviewFrameParts): string {
  const n = parts.nonce ? ` nonce="${escapeAttr(parts.nonce)}"` : '';
  return (
    '<!doctype html><html lang="en" data-scheme="light"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    parts.bridge +
    `<script${n}>${PAGED_RUNTIME}</script>` +
    parts.head +
    `<style${n}>${PREVIEW_FRAME_CSS}</style>` +
    `</head><body><article id="orz-doc" class="${parts.articleClass}" data-orz-paged-preview data-orz-copy></article>${parts.scripts}</body></html>`
  );
}

/** The preview's presentation of a text (`followPresentation`): the webfonts of its theme and presets, its page size. */
export function pagedPreviewPresentation(text: string): { head: string; scheme: 'light'; articleClass: string } {
  return previewPresentation(presentationOf(text));
}
