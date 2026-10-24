/**
 * The IIFE entry of `orz-paged-browser` (`orz-paged.browser.js`). First its
 * own script text is captured (`captureEngineSource`, only this carrier's
 * bundle: an inline file's `#orz-engine` — or the update sandbox's — exact
 * bundle, which an inline assembly writes back; a script loaded by URL as
 * `orz-paged.browser.js`); then the kit's `startCarrier` sets the standard
 * bundle global `globalThis.OrzCarrier` (FC-19 §2) and, when it runs inside
 * an assembled `.paged.html` (an `#orz-src` island is present), boots the
 * standalone file (orz-markdown `carrier/app`: the read view — Paged.js pages
 * in the page —, chrome, edit mode, saves, host, quiet update).
 *
 * The global also holds the kit's `printDocument` (an app prints a document
 * of the editor's text, round 3); a booted file sets `window.__orzPrintReady`
 * (its final layout), which `printDocument` waits for.
 *
 * In the quiet update's sandbox and in an app's page there is no island: only
 * the global is set, nothing else is touched (no storage, no network, no DOM;
 * the paged runtime is injected only by the read view).
 */
import { captureEngineSource, startCarrier } from 'orz-markdown/carrier/app';
import { BUNDLE_FILE } from '../assemble.js';
import { includeTargets, linkTargets, printDocument, useEngineSource } from './carrier.js';
import { PAGED_KIND } from './paged/kind.js';

// Only this carrier's bundle is the engine (orz-markdown A.12): a script loaded as `orz-paged.browser.js`,
// the file's `#orz-engine` or the update sandbox's bundle — never an app script that bundles this IIFE.
useEngineSource(captureEngineSource(undefined, { bundle: BUNDLE_FILE }));
const { carrier, app } = startCarrier(PAGED_KIND);
// the kit's print of a whole document, for apps (`OrzCarrier.printDocument(html, { nonce })`, FC-19 §8.5), and the
// targets a text points at (the kit's browser-safe includeTargets / linkTargets, 2.5.0)
try { Object.assign(carrier as unknown as Record<string, unknown>, { printDocument, includeTargets, linkTargets }); } catch { /* a frozen global */ }
// an assembled file printed by an app's `printDocument` (a hidden sandboxed frame): it prints when the pages are final
if (app && typeof window === 'object') {
  (window as unknown as { __orzPrintReady?: () => Promise<void> }).__orzPrintReady = () =>
    Promise.resolve(app.ready).then(() => (app.view as unknown as { idle?(): Promise<void> }).idle?.());
}
