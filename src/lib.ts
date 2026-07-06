/**
 * orz-paged library entry — generate a self-contained `.paged.html` in-process.
 *
 * This is the programmatic twin of the CLI's default (`--inline`) render path: a
 * host platform calls {@link buildPagedHtml} and gets back the FULL document
 * string, fully inline (inlined engine bundle + inlined base/theme CSS + full
 * template catalog + embedded source). Math/diagram/font libs still load from
 * CDN at view time — exactly as the CLI's inline output does.
 *
 * Both the CLI and this module compose through {@link composeInlineHtml}, so
 * there is a single render path. The CLI keeps its argument parsing, template
 * scaffolding (`--new`/`--list-templates`), source-selection (`--template`), and
 * the `--cdn` mode; the shared inline composition lives here.
 *
 * Asset resolution is relative to this module (`import.meta.url`), never
 * `process.cwd()`, so it works from an installed npm package.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBrowserRuntimeScript } from 'orz-markdown/runtime';
import { PREVIEW_CDN } from 'orz-markdown/preview-frame';
import { buildHtml, type ThemeAsset, type RendererSpec, type TemplateAsset } from './template.js';
import { templateList } from './doc/templates.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

export const selfVersion: string =
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';

/** Pinned CDN assets used at view time — sourced from orz-markdown's shared
 *  preview-frame helper so every host app loads identical, tested versions.
 *  Paged is light-only, so highlight.js uses the light (github) stylesheet. */
export const CDN = {
  katexCss: PREVIEW_CDN.katexCss,
  mermaidJs: PREVIEW_CDN.mermaidJs,
  smilesJs: PREVIEW_CDN.smilesJs,
  chartJs: PREVIEW_CDN.chartJs,
  hljsJs: PREVIEW_CDN.hljsJs,
  hljsCss: PREVIEW_CDN.hljsLightCss,
};

export function findAsset(rel: string): string {
  const p = join(ROOT, rel);
  if (!existsSync(p)) throw new Error('missing asset: ' + rel + ' (run `npm run build` first)');
  return p;
}

/** Drop a theme's `@import url("./base.css")` — base is inlined separately, so the
 *  relative import points nowhere (404 on http; a fetch hazard on file://). */
export function stripBaseImport(css: string): string {
  return css.replace(/@import\s+url\(\s*['"]?\.\/base\.css['"]?\s*\)\s*;?/gi, '');
}

export function loadThemes(): { baseCss: string; themes: ThemeAsset[] } {
  const dir = findAsset('assets/themes');
  const baseCss = readFileSync(join(dir, 'base.css'), 'utf8');
  const themes = readdirSync(dir)
    .filter((f) => f.endsWith('.css') && f !== 'base.css')
    .map((f) => ({ id: f.replace(/\.css$/, ''), css: stripBaseImport(readFileSync(join(dir, f), 'utf8')) }));
  return { baseCss, themes };
}

/** Load every template's starter skeleton from `assets/templates/<stem>.md`. */
export function loadTemplates(): TemplateAsset[] {
  const dir = findAsset('assets/templates');
  return templateList().map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    group: t.group,
    skeleton: readFileSync(join(dir, t.skeleton + '.md'), 'utf8'),
  }));
}

/** The default theme id, matching the CLI: prefer `light-neat-1`, else the first
 *  loaded theme, else `'none'`. */
export function pickDefaultTheme(themes: ThemeAsset[]): string {
  return themes.some((t) => t.id === 'light-neat-1') ? 'light-neat-1' : (themes[0]?.id ?? 'none');
}

/**
 * The shared inline composition — called by both the CLI (`--inline`, the
 * default) and {@link buildPagedHtml}. Loads all assets from the package, builds
 * an inline renderer, and returns the full document string. Deterministic: paged
 * has no per-document random id, so the same `(source, title, theme?)` always
 * yields byte-identical output.
 *
 * @param theme  optional theme id; when omitted (or unknown) the default theme
 *               ({@link pickDefaultTheme}) drives the picker's initial selection.
 */
export function composeInlineHtml(
  source: string,
  title: string,
  theme?: string,
  delivery?: 'inline' | 'cdn',
): string {
  const templates = loadTemplates();
  const { baseCss, themes } = loadThemes();
  const appJs = readFileSync(findAsset('assets/app.js'), 'utf8');
  const runtime = getBrowserRuntimeScript(); // copy-as-Markdown (+ qr) from orz-markdown

  // `cdn` references the published engine on jsDelivr (small file); `inline`
  // (default) embeds it. Only the renderer differs from the inline path.
  const renderer: RendererSpec =
    delivery === 'cdn'
      ? {
          mode: 'cdn',
          src: `https://cdn.jsdelivr.net/npm/orz-paged-browser@${selfVersion}/orz-paged.browser.js`,
        }
      : {
          mode: 'inline',
          js: readFileSync(findAsset('dist/orz-paged.browser.js'), 'utf8'),
        };

  const known = theme && themes.some((t) => t.id === theme);
  const defaultTheme = known ? (theme as string) : pickDefaultTheme(themes);

  return buildHtml({
    source,
    title,
    rendererVersion: selfVersion,
    renderer,
    baseCss,
    themes,
    defaultTheme,
    templates,
    cdn: CDN,
    appJs,
    runtime,
  });
}

/**
 * Generate a self-contained `.paged.html` document, fully inline.
 *
 * Mirrors the CLI's default `--inline` mode; the returned string is
 * byte-identical to CLI inline output for the same source/title/theme.
 *
 * @param opts.markdown  the document source (the host passes content).
 * @param opts.title     `<title>` + generator title; defaults to `'Untitled'`.
 * @param opts.theme     initial theme id; unknown/omitted → the default theme.
 * @param opts.template  a starter-skeleton selector, mirroring the CLI's
 *   `--template <name>` with no input file: used as the source ONLY when
 *   `opts.markdown` is empty/whitespace. When `markdown` has content, it wins.
 *   The full template catalog is always embedded regardless (it powers the
 *   in-editor picker), so this never changes the catalog — only the initial
 *   source. An unknown template name is ignored (falls back to `markdown`).
 */
export function buildPagedHtml(opts: {
  markdown: string;
  title?: string;
  theme?: string;
  template?: string;
  /** `inline` (default, offline) or `cdn` (small file — engine from jsDelivr;
   *  requires orz-paged-browser published at this version). */
  delivery?: 'inline' | 'cdn';
}): string {
  let source = opts.markdown;
  if (opts.template && !opts.markdown.trim()) {
    const templates = loadTemplates();
    const t = templates.find((x) => x.id === opts.template)
      ?? templates.find((x) => x.id === opts.template + '-section'); // legacy: article→article-section
    if (t) source = t.skeleton;
  }
  const title = opts.title || 'Untitled';
  return composeInlineHtml(source, title, opts.theme, opts.delivery);
}
