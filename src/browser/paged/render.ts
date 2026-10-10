/**
 * KIND-SPECIFIC (paged): a text → what the paged runtime lays out
 * ({@link PagedInput}): `renderDocumentAsync` (settings from the header,
 * elements, the body through the kit's `renderMarkdownPreviewWithIncludes`
 * with includes and `data-src-line` anchors, page CSS) plus the print theme's
 * stylesheets (bundled, `orz-paged:themes`) and the webfont links of the
 * theme and the header's font presets. The read view, the editor preview and
 * `renderPreview` all render through it.
 */
import { BASE_CSS, THEME_CSS } from 'orz-paged:themes';
import { renderDocumentAsync, type RenderDocumentOptions } from '../../render-paged.js';
import { presentationOfSettings } from '../../presentation.js';
import { encodePreviewHtml, type PagedInput, type PagedSheet } from '../../paged/input.js';
import type { PagedAssembly } from '../../types.js';
import { rememberRendered } from './versions.js';

export type PagedRenderContext = RenderDocumentOptions;

/** The theme's stylesheets for Paged.js, in src/themes.ts' load order: base, then the theme's own (the page CSS goes last). */
export function themeSheets(theme: string): PagedSheet[] {
  const sheets: PagedSheet[] = [{ name: 'orz-base.css', css: BASE_CSS }];
  const css = Object.prototype.hasOwnProperty.call(THEME_CSS, theme) ? THEME_CSS[theme] : undefined;
  if (css) sheets.push({ name: 'orz-theme.css', css });
  return sheets;
}

/** The runtime's input for a rendered assembly. */
export function inputOf(a: PagedAssembly): PagedInput {
  const p = presentationOfSettings(a.settings);
  return {
    bodyHtml: a.bodyHtml,
    sheets: [...themeSheets(p.theme), { name: 'orz-page.css', css: a.css }],
    links: p.fontUrls,
    frontMatterClean: a.settings.frontMatterClean,
    dynamicChoices: { ...a.settings.dynamicChoices },
  };
}

/** Render a paged text into the runtime's input. */
export async function renderPaged(text: string, ctx: PagedRenderContext = {}): Promise<PagedInput> {
  const input = inputOf(await renderDocumentAsync(text, ctx));
  // the Version setting reads what this render found (includes resolved) instead of rendering again
  rememberRendered(text, input.bodyHtml);
  return input;
}

/** The editor preview's renderer (FC-19 §8.4): the input as the frame's payload (body HTML + JSON). */
export async function renderPagedPreview(text: string, ctx: PagedRenderContext = {}): Promise<string> {
  return encodePreviewHtml(await renderPaged(text, ctx));
}
