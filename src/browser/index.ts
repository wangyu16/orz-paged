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
 * In the quiet update's sandbox and in an app's page there is no island: only
 * the global is set, nothing else is touched (no storage, no network, no DOM;
 * the paged runtime is injected only by the read view).
 */
import { captureEngineSource, startCarrier } from 'orz-markdown/carrier/app';
import { BUNDLE_FILE } from '../assemble.js';
import { useEngineSource } from './carrier.js';
import { PAGED_KIND } from './paged/kind.js';

// Only this carrier's bundle is the engine (orz-markdown A.12): a script loaded as `orz-paged.browser.js`,
// the file's `#orz-engine` or the update sandbox's bundle — never an app script that bundles this IIFE.
useEngineSource(captureEngineSource(undefined, { bundle: BUNDLE_FILE }));
startCarrier(PAGED_KIND);
