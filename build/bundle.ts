/**
 * Bundles src/browser-entry.ts (+ orz-markdown, paged.js, the document layer and
 * renderer) into a single browser IIFE at dist/orz-paged.browser.js — the
 * in-file paged-document engine.
 *
 * It is either inlined into each .paged.html (`--inline`) or published to npm as
 * `orz-paged-browser` and served from jsDelivr (`--cdn`).
 *
 * orz-markdown ≥ 2 is browser-clean (no `fs`, `path` or `process` at import),
 * so no shims, aliases or injected globals are needed (rebuild step 1; D-40,
 * D-44, D-45). The engine's version is src/version.ts (generated from
 * package.json by scripts/sync-version.ts), not a define.
 *
 * Usable as a module (tests/global-setup.ts calls {@link buildBrowser}) and as
 * a script (`npm run bundle`).
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION as ORZ_MARKDOWN_VERSION } from 'orz-markdown/version';
import { VERSION } from '../src/version.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/** The engine bundle's file name (dist/ and the orz-paged-browser package). */
export const BUNDLE_FILE = 'orz-paged.browser.js';

/** Build the browser engine in memory. */
export async function buildBrowser(): Promise<string> {
  const out = await build({
    entryPoints: [join(ROOT, 'src', 'browser-entry.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    sourcemap: false,
    write: false,
    charset: 'utf8',
    logLevel: 'warning',
  });
  return out.outputFiles[0].text;
}

/** Write the engine to dist/ (where the 0.x library inlines it) and stage it into browser/ (published to the CDN). */
export function writeBrowser(code: string): void {
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist', BUNDLE_FILE), code, 'utf8');
  mkdirSync(join(ROOT, 'browser'), { recursive: true });
  writeFileSync(join(ROOT, 'browser', BUNDLE_FILE), code, 'utf8');
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const code = await buildBrowser();
  writeBrowser(code);
  console.log(`Bundled orz-paged@${VERSION} (orz-markdown@${ORZ_MARKDOWN_VERSION}) → dist/${BUNDLE_FILE} (+ browser/), ${(code.length / 1024).toFixed(0)} kB`);
}
