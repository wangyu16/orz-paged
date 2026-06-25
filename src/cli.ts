#!/usr/bin/env node
/**
 * orz-paged CLI (A5) — generate a self-contained `.paged.html` from Markdown.
 *
 *   orz-paged <input.md> [-o out.paged.html] [--inline|--cdn] [--title t]
 *
 * `--inline` (default) embeds the engine bundle + base/theme CSS; `--cdn`
 * references the published `orz-paged-browser` on jsDelivr. Fonts, images, and the
 * math/diagram libs always load from CDN at view time (DESIGN §4).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHtml, type ThemeAsset, type RendererSpec } from './template.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const selfVersion: string =
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';

/** Pinned CDN assets used at view time. */
const CDN = {
  katexCss: 'https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css',
  mermaidJs: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
  smilesJs: 'https://unpkg.com/smiles-drawer@1.0.10/dist/smiles-drawer.min.js',
  chartJs: 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js',
};

function findAsset(rel: string): string {
  const p = join(ROOT, rel);
  if (!existsSync(p)) throw new Error('missing asset: ' + rel + ' (run `npm run build` first)');
  return p;
}

/** Drop a theme's `@import url("./base.css")` — base is inlined separately, so the
 *  relative import points nowhere (404 on http; a fetch hazard on file://). */
function stripBaseImport(css: string): string {
  return css.replace(/@import\s+url\(\s*['"]?\.\/base\.css['"]?\s*\)\s*;?/gi, '');
}

function loadThemes(): { baseCss: string; themes: ThemeAsset[] } {
  const dir = findAsset('assets/themes');
  const baseCss = readFileSync(join(dir, 'base.css'), 'utf8');
  const themes = readdirSync(dir)
    .filter((f) => f.endsWith('.css') && f !== 'base.css')
    .map((f) => ({ id: f.replace(/\.css$/, ''), css: stripBaseImport(readFileSync(join(dir, f), 'utf8')) }));
  return { baseCss, themes };
}

function parseArgs(argv: string[]) {
  const a: { input?: string; out?: string; mode: 'inline' | 'cdn'; title?: string } = { mode: 'inline' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-o' || arg === '--out') a.out = argv[++i];
    else if (arg === '--inline') a.mode = 'inline';
    else if (arg === '--cdn') a.mode = 'cdn';
    else if (arg === '--title') a.title = argv[++i];
    else if (!arg.startsWith('-')) a.input = arg;
  }
  return a;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Usage: orz-paged <input.md> [-o out.paged.html] [--inline|--cdn] [--title t]');
    process.exit(1);
  }
  const inPath = resolve(args.input);
  const source = readFileSync(inPath, 'utf8');
  const base = basename(inPath).replace(/\.(md|markdown)$/i, '');
  const outPath = args.out ? resolve(args.out) : join(dirname(inPath), base + '.paged.html');
  const title = args.title || base;

  const { baseCss, themes } = loadThemes();
  const appJs = readFileSync(findAsset('assets/app.js'), 'utf8');

  let renderer: RendererSpec;
  if (args.mode === 'cdn') {
    renderer = { mode: 'cdn', src: `https://cdn.jsdelivr.net/npm/orz-paged-browser@${selfVersion}/orz-paged.browser.js` };
  } else {
    renderer = { mode: 'inline', js: readFileSync(findAsset('dist/orz-paged.browser.js'), 'utf8') };
  }

  const html = buildHtml({
    source,
    title,
    rendererVersion: selfVersion,
    renderer,
    baseCss,
    themes,
    defaultTheme: themes[0] ? themes[0].id : 'none',
    cdn: CDN,
    appJs,
  });

  writeFileSync(outPath, html, 'utf8');
  console.log(`Wrote ${outPath} (${args.mode}, ${themes.length} themes)`);
}

main();
