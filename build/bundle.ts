/**
 * Builds the `orz-paged-browser` package (browser/) — mirrors orz-mdhtml's
 * build/bundle.ts:
 *
 * - the paged runtime (src/paged/runtime.ts: Paged.js 0.4.3, the two-column
 *   handler, enhancement, TOC and front matter) — an IIFE built first and
 *   carried by the engine as a string (`__ORZ_PAGED_RUNTIME__`): the read view
 *   injects it into the page, the editor's preview frame carries it, so
 *   Paged.js is in the bundle once;
 * - `orz-paged.browser.js` — the IIFE (src/browser/index.ts) that sets
 *   `globalThis.OrzCarrier` (FC-19 §2) and boots an assembled file. It obeys
 *   the BUNDLE RULE (spec/shell-runtime.md §6): every `<` before
 *   `script`/`/script` is rewritten as `\x3C` (same value in every string,
 *   template and regular expression), then it must be script-safe (the kit's
 *   `isScriptSafe`) and hold no CR or NUL — else the build fails. Both builds
 *   (and the runtime) are pure ASCII (esbuild `charset: 'ascii'`: every other
 *   character is a `\u` escape), so they mean the same under any charset a
 *   server or a page declares, and their bytes equal their text;
 * - `esm/orz-paged.browser.mjs` — the same API as ES module exports
 *   (src/browser/esm.ts), for apps that bundle it themselves;
 * - `docs/embedding.md` — a copy of the app author's guide (shipped);
 * - `release.json` — the release manifest (kind, version, formats, notes,
 *   bundle path and the SHA-384 integrity of the IIFE's exact bytes, computed
 *   AFTER the rewrite).
 *
 * The print themes (src/themes.ts: `base.css` and one stylesheet per theme,
 * derived by scripts/build-themes.ts) are bundled as text (the virtual module
 * `orz-paged:themes`), so an inline and a cdn file style the same with no
 * theme fetch (D-50).
 *
 * One KaTeX: orz-markdown's CommonJS build requires `katex` and
 * `katex/contrib/mhchem`; both resolve to the CommonJS build of the KaTeX
 * that orz-markdown itself resolves (found from orz-markdown's real
 * directory), so `\ce{…}` is registered on the KaTeX that renders.
 *
 * The same IIFE and `release.json` are also staged into `dist/` (the
 * `orz-paged` package), where the Node library reads them (src/engine.ts).
 *
 * `buildBrowser({ version })` builds in memory (tests; a `next` release with a
 * higher version for the conformance harness): the version replaces
 * src/version.ts for that build only.
 */
import { build, type Plugin } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { isScriptSafe } from 'orz-markdown/carrier/shell';
import { VERSION as ORZ_MARKDOWN_VERSION } from 'orz-markdown/version';
import { VERSION } from '../src/version.js';
import { BASE_STYLESHEET, THEME_INFO, themeStylesheet } from '../src/themes.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BUNDLE_FILE = 'orz-paged.browser.js';
export const ESM_FILE = 'esm/orz-paged.browser.mjs';

/**
 * What esbuild's `charset: 'ascii'` leaves (it does not escape inside regular
 * expression literals): each remaining non-ASCII UTF-16 unit as a `\uXXXX`
 * escape.
 */
export const asciiOnly = (code: string): string => code.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** The bundle rule's rewrite: `<script` / `</script` (any case, after backslashes) → `\x3C…`. */
export const scriptSafe = (code: string): string => code.replace(/<(\\*)(\/?script)/gi, '\\x3C$1$2');

export const sri = (bytes: string): string => `sha384-${createHash('sha384').update(bytes, 'utf8').digest('base64')}`;

/** The `dist/` of the KaTeX orz-markdown resolves (from its real directory). */
export function katexDist(): string {
  const kit = realpathSync(join(ROOT, 'node_modules', 'orz-markdown'));
  return join(dirname(createRequire(join(kit, 'package.json')).resolve('katex/package.json')), 'dist');
}

const oneKatex: Plugin = {
  name: 'one-katex',
  setup(b) {
    const dir = katexDist();
    b.onResolve({ filter: /^katex$/ }, () => ({ path: join(dir, 'katex.js') }));
    b.onResolve({ filter: /^katex\/contrib\/mhchem$/ }, () => ({ path: join(dir, 'contrib', 'mhchem.js') }));
  },
};

/** src/version.ts replaced by another version (a `next` build); the package version otherwise. */
const versionAs = (version: string | undefined): Plugin => ({
  name: 'version-as',
  setup(b) {
    if (version === undefined) return;
    b.onLoad({ filter: /[\\/]src[\\/]version\.ts$/ }, () => ({ contents: `export const VERSION = ${JSON.stringify(version)};\n`, loader: 'ts' }));
  },
});

/**
 * The print themes as text (src/themes.ts: `BASE_STYLESHEET`, each theme's
 * `themeStylesheet`): `base` and `themes` (id → CSS, an `@import` of
 * base.css dropped — base is loaded first on its own).
 */
export function themeTexts(): { base: string; themes: Record<string, string> } {
  const strip = (css: string): string => css.replace(/@import\s+url\(\s*['"]?(\.\.?\/)*base\.css['"]?\s*\)\s*;?/gi, '');
  const themes: Record<string, string> = {};
  for (const t of THEME_INFO) themes[t.id] = strip(readFileSync(join(ROOT, themeStylesheet(t.id)), 'utf8'));
  return { base: readFileSync(join(ROOT, BASE_STYLESHEET), 'utf8'), themes };
}

const themesModule: Plugin = {
  name: 'orz-paged-themes',
  setup(b) {
    b.onResolve({ filter: /^orz-paged:themes$/ }, () => ({ path: 'themes', namespace: 'orz-paged-themes' }));
    b.onLoad({ filter: /.*/, namespace: 'orz-paged-themes' }, () => {
      const t = themeTexts();
      return { contents: `export const BASE_CSS = ${JSON.stringify(t.base)};\nexport const THEME_CSS = Object.freeze(${JSON.stringify(t.themes)});\n`, loader: 'js' };
    });
  },
};

export interface BrowserBuild {
  version: string;
  /** The paged runtime's exact text (script-safe, ASCII): what the read view injects and the preview frame carries. */
  runtime: string;
  /** The IIFE's exact text (after the rewrite). */
  iife: string;
  esm: string;
  /** `release.json`'s content (formatted, with a final newline). */
  release: string;
  integrity: string;
}

/** The release notes link of a version. */
const notesUrl = (v: string): string => `https://github.com/wangyu16/orz-paged/blob/main/CHANGELOG.md#${v.replace(/[^0-9a-z]/gi, '')}`;

/** Check the bundle rule on built code; throws with the reason. */
export function checkBundleRule(code: string, what: string): void {
  if (!isScriptSafe(code)) throw new Error(`${what}: not script-safe after the rewrite (a <script or </script sequence remains)`);
  if (code.includes('\r')) throw new Error(`${what}: holds a CR (U+000D); an inlined copy would not match its integrity`);
  if (code.includes('\u0000')) throw new Error(`${what}: holds a NUL`);
  if (/[^\x00-\x7f]/.test(code)) throw new Error(`${what}: holds a non-ASCII character (the build is charset: 'ascii')`);
}

const common = (version: string | undefined) => ({
  bundle: true, minify: true, platform: 'browser' as const, target: ['es2020'], write: false, logLevel: 'silent' as const,
  charset: 'ascii' as const, legalComments: 'none' as const, absWorkingDir: ROOT, plugins: [oneKatex, versionAs(version), themesModule],
});

/** Build the paged runtime (src/paged/runtime.ts) in memory: an IIFE, script-safe and ASCII. */
export async function buildRuntime(o: { version?: string } = {}): Promise<string> {
  const version = o.version ?? VERSION;
  const out = await build({ ...common(o.version), entryPoints: ['src/paged/runtime.ts'], format: 'iife', define: { __ORZ_PAGED_RUNTIME_VERSION__: JSON.stringify(version) } });
  const code = scriptSafe(asciiOnly(out.outputFiles![0].text));
  checkBundleRule(code, 'the paged runtime');
  return code;
}

/** Build the runtime, the IIFE, the ESM build and release.json in memory. */
export async function buildBrowser(o: { version?: string } = {}): Promise<BrowserBuild> {
  const version = o.version ?? VERSION;
  const runtime = await buildRuntime(o);
  const define = { __ORZ_PAGED_RUNTIME__: JSON.stringify(runtime) };
  const [iifeOut, esmOut] = await Promise.all([
    build({ ...common(o.version), entryPoints: ['src/browser/index.ts'], format: 'iife', define }),
    build({ ...common(o.version), entryPoints: ['src/browser/esm.ts'], format: 'esm', define }),
  ]);
  const iife = scriptSafe(asciiOnly(iifeOut.outputFiles![0].text));
  const esm = scriptSafe(asciiOnly(esmOut.outputFiles![0].text));
  checkBundleRule(iife, BUNDLE_FILE);
  checkBundleRule(esm, ESM_FILE);
  const integrity = sri(iife);
  const release = `${JSON.stringify({ kind: 'paged', version, formats: [1], notes: notesUrl(version), bundle: { path: BUNDLE_FILE, integrity } }, null, 2)}\n`;
  return { version, runtime, iife, esm, release, integrity };
}

/** Write a build into a package folder (default browser/), with the app author's guide (docs/embedding.md, shipped in the package). */
export function writeBrowser(b: BrowserBuild, dir = join(ROOT, 'browser')): { bundle: string; esm: string; release: string; guide: string } {
  mkdirSync(join(dir, 'esm'), { recursive: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  const paths = { bundle: join(dir, BUNDLE_FILE), esm: join(dir, ESM_FILE), release: join(dir, 'release.json'), guide: join(dir, 'docs', 'embedding.md') };
  writeFileSync(paths.bundle, b.iife, 'utf8');
  writeFileSync(paths.esm, b.esm, 'utf8');
  writeFileSync(paths.release, b.release, 'utf8');
  writeFileSync(paths.guide, readFileSync(join(ROOT, 'docs', 'embedding.md'), 'utf8'), 'utf8');
  return paths;
}

/** Stage the IIFE and release.json into the `orz-paged` package (dist/), for the Node library (src/engine.ts). */
export function writeLibEngine(b: BrowserBuild, dir = join(ROOT, 'dist')): { bundle: string; release: string } {
  mkdirSync(dir, { recursive: true });
  const paths = { bundle: join(dir, BUNDLE_FILE), release: join(dir, 'release.json') };
  writeFileSync(paths.bundle, b.iife, 'utf8');
  writeFileSync(paths.release, b.release, 'utf8');
  return paths;
}

const kb = (s: string): string => `${(Buffer.byteLength(s, 'utf8') / 1024).toFixed(1)} KiB (gzip ${(gzipSync(s).length / 1024).toFixed(1)} KiB)`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const b = await buildBrowser();
  const paths = writeBrowser(b);
  const lib = writeLibEngine(b);
  console.log(`orz-paged-browser ${b.version} (orz-markdown ${ORZ_MARKDOWN_VERSION}):`);
  console.log(`  ${paths.bundle}  ${kb(b.iife)}  ${b.integrity}`);
  console.log(`    of which the paged runtime (Paged.js, baseline grid, columns): ${kb(b.runtime)}`);
  console.log(`  ${paths.esm}  ${kb(b.esm)}`);
  console.log(`  ${paths.release}`);
  console.log(`  ${paths.guide} (docs/embedding.md, shipped)`);
  console.log(`  ${lib.bundle} + ${lib.release} (the Node library's engine, same bytes)`);
}
