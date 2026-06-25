/**
 * Bundles src/browser-entry.ts (+ orz-markdown, paged.js, the document layer and
 * assembler) into a single browser IIFE at dist/orz-paged.browser.js — the
 * in-file paged-document engine.
 *
 * It is either inlined into each .paged.html (`--inline`) or published to npm as
 * `orz-paged-browser` and served from jsDelivr (`--cdn`). Mirrors orz-slides'
 * build/bundle.ts (reveal.js → paged.js).
 */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/** orz-paged's own version pins the engine into each generated file. */
const selfVersion: string =
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';

mkdirSync(join(ROOT, 'dist'), { recursive: true });

/** Redirect markdown-it-imsize's fs/dynamic-require image reader to a stub. */
const stubImsizeFsReader = {
  name: 'stub-imsize-fs-reader',
  setup(b: import('esbuild').PluginBuild) {
    b.onResolve({ filter: /(^|[\\/])imsize$/ }, (args) => {
      if (args.importer.includes('markdown-it-imsize')) {
        return { path: join(HERE, 'shims', 'imsize.cjs') };
      }
      return undefined;
    });
  },
};

await build({
  entryPoints: [join(ROOT, 'src', 'browser-entry.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  outfile: join(ROOT, 'dist', 'orz-paged.browser.js'),
  minify: true,
  sourcemap: false,
  plugins: [stubImsizeFsReader],
  // Filesystem-only orz-markdown features don't apply in the browser: give
  // `path` a real browser impl and `fs` a graceful stub.
  alias: {
    fs: join(HERE, 'shims', 'fs.cjs'),
    path: 'path-browserify',
  },
  inject: [join(HERE, 'shims', 'process.js')],
  define: {
    __ORZPAGED_VERSION__: JSON.stringify(selfVersion),
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

// Stage the bundle into the orz-paged-browser package (published to CDN).
const browserPkgDir = join(ROOT, 'browser');
mkdirSync(browserPkgDir, { recursive: true });
copyFileSync(
  join(ROOT, 'dist', 'orz-paged.browser.js'),
  join(browserPkgDir, 'orz-paged.browser.js')
);

console.log(`Bundled orz-paged@${selfVersion} → dist/orz-paged.browser.js (+ browser/)`);
