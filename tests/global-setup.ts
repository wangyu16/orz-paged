/**
 * Runs once before the suite — what `npm run bundle` makes: the browser engine
 * staged into `dist/` (and `browser/`), where the 0.x library path
 * (`composeInlineHtml`, tests/lib.test.ts) inlines it. Rebuilt every run, so a
 * stale engine cannot pass unnoticed.
 */
import { buildBrowser, writeBrowser } from '../build/bundle.js';

export async function setup(): Promise<void> {
  writeBrowser(await buildBrowser());
}
