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
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';
import { buildHtml, type RendererSpec, type TemplateAsset } from './template.js';
import {
  selfVersion,
  CDN,
  findAsset,
  loadThemes,
  loadTemplates,
  pickDefaultTheme,
  composeInlineHtml,
} from './lib.js';

function parseArgs(argv: string[]) {
  const a: {
    input?: string; out?: string; mode: 'inline' | 'cdn'; title?: string;
    template?: string; newDoc?: string; list?: boolean;
  } = { mode: 'inline' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-o' || arg === '--out') a.out = argv[++i];
    else if (arg === '--inline') a.mode = 'inline';
    else if (arg === '--cdn') a.mode = 'cdn';
    else if (arg === '--title') a.title = argv[++i];
    else if (arg === '--template') a.template = argv[++i];
    else if (arg === '--new') a.newDoc = argv[++i];
    else if (arg === '--list-templates') a.list = true;
    else if (!arg.startsWith('-')) a.input = arg;
  }
  return a;
}

/** Resolve a (possibly legacy) template name to its loaded skeleton, or exit. */
function skeletonOrExit(name: string, templates: TemplateAsset[]): TemplateAsset {
  const t = templates.find((x) => x.id === name)
    ?? templates.find((x) => x.id === name + '-section'); // legacy: article→article-section
  if (!t) {
    console.error(`Unknown template: ${name}\nKnown: ${templates.map((x) => x.id).join(', ')}`);
    process.exit(1);
  }
  return t;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const templates = loadTemplates();

  // `--list-templates` — print the catalog and exit.
  if (args.list) {
    console.log('Templates (use --template <name> or --new <name>):\n');
    let group = '';
    for (const t of templates) {
      if (t.group !== group) { group = t.group; console.log(`  ${group}`); }
      console.log(`    ${t.id.padEnd(16)} ${t.description}`);
    }
    return;
  }

  // `--new <name>` — scaffold the starter Markdown to a .md file (then edit it).
  if (args.newDoc) {
    const t = skeletonOrExit(args.newDoc, templates);
    const outMd = args.out ? resolve(args.out) : resolve(t.id + '.md');
    writeFileSync(outMd, t.skeleton, 'utf8');
    console.log(`Wrote ${outMd} (starter for "${t.label}")`);
    return;
  }

  // Source = an input file, or a template skeleton via `--template <name>`.
  let source: string;
  let base: string;
  if (args.input) {
    source = readFileSync(resolve(args.input), 'utf8');
    base = basename(resolve(args.input)).replace(/\.(md|markdown)$/i, '');
  } else if (args.template) {
    const t = skeletonOrExit(args.template, templates);
    source = t.skeleton;
    base = t.id;
  } else {
    console.error(
      'Usage: orz-paged <input.md> [-o out.paged.html] [--inline|--cdn] [--title t]\n' +
      '       orz-paged --template <name> [-o out.paged.html]   # scaffold + render a starter\n' +
      '       orz-paged --new <name> [-o out.md]                # write a starter .md to edit\n' +
      '       orz-paged --list-templates',
    );
    process.exit(1);
  }
  const inDir = args.input ? dirname(resolve(args.input)) : process.cwd();
  const outPath = args.out ? resolve(args.out) : join(inDir, base + '.paged.html');
  const title = args.title || base;

  let html: string;
  let themeCount: number;
  if (args.mode === 'cdn') {
    // CDN mode references the published engine on jsDelivr (not inlined), so it
    // has its own composition; the default inline path shares composeInlineHtml.
    const { baseCss, themes } = loadThemes();
    const appJs = readFileSync(findAsset('assets/app.js'), 'utf8');
    const runtime = getBrowserRuntimeScript(); // copy-as-Markdown (+ qr) from orz-markdown
    const renderer: RendererSpec = {
      mode: 'cdn',
      src: `https://cdn.jsdelivr.net/npm/orz-paged-browser@${selfVersion}/orz-paged.browser.js`,
    };
    themeCount = themes.length;
    html = buildHtml({
      source,
      title,
      rendererVersion: selfVersion,
      renderer,
      baseCss,
      themes,
      defaultTheme: pickDefaultTheme(themes),
      templates,
      cdn: CDN,
      appJs,
      runtime,
    });
  } else {
    // Default: fully-inline, via the shared composition used by the library.
    themeCount = loadThemes().themes.length;
    html = composeInlineHtml(source, title);
  }

  writeFileSync(outPath, html, 'utf8');
  console.log(`Wrote ${outPath} (${args.mode}, ${themeCount} themes)`);
}

main();
