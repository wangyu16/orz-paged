/**
 * Runs once before the suite — what `npm run bundle` makes: the browser
 * engine (with the paged runtime) staged into `browser/` (the
 * `orz-paged-browser` package) and `dist/` (`orz-paged.browser.js` +
 * `release.json`, where the Node library reads it), and the 0.x engine
 * (`dist/orz-paged.legacy.js`) the 0.x composition (`composeInlineHtml`,
 * tests/lib.test.ts) inlines. Rebuilt every run, so a stale engine cannot
 * pass unnoticed.
 */
import { buildBrowser, buildLegacyBrowser, writeBrowser, writeLegacy, writeLibEngine } from '../build/bundle.js';

export async function setup(): Promise<void> {
  const b = await buildBrowser();
  writeBrowser(b);
  writeLibEngine(b);
  writeLegacy(await buildLegacyBrowser());
}
