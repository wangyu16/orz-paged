/**
 * The ESM entry of `orz-paged-browser` (`esm/orz-paged.browser.mjs`), for web
 * apps that bundle the component themselves (FD-06): the FC-19 §2 API as
 * named exports plus an `OrzCarrier` object of the same shape as the IIFE's
 * global. It sets no global and boots nothing.
 *
 * Inline assembly without `engineSource` fetches this release's IIFE bundle
 * from jsDelivr (`orz-paged-browser@<version>/orz-paged.browser.js`) — an
 * app that assembles inline files offline passes `engineSource` itself.
 */
import { assemble, extract, formats, kind, mountEditor as mount, printDocument, readDocument, renderPreview, version, type Editor, type EditorOptions } from './carrier.js';

export { assemble, extract, formats, kind, printDocument, readDocument, renderPreview, version, editHeader } from './carrier.js';
export type { Editor, EditorOptions, RenderPreviewOptions, DocumentInfo, Extracted, HeaderChange, EditorHooks, PreferenceStore } from './carrier.js';
export { THEMES, DEFAULT_THEME } from '../themes.js';
export { TEMPLATE_IDS, DEFAULT_TEMPLATE, newDocument } from '../assemble.js';

/** FC-19 `mountEditor` (an app host: pass `hooks.save` to own persistence). */
export function mountEditor(element: HTMLElement, options: EditorOptions): Editor {
  return mount(element, options);
}

/** The FC-19 §2 surface as one object (the IIFE's `globalThis.OrzCarrier`, without booting a file). */
export const OrzCarrier = Object.freeze({ kind, version, formats, assemble, extract, readDocument, mountEditor, renderPreview, printDocument });
