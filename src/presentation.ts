/**
 * The `paged` kind's presentation: what the header asks the shell, the read
 * view and the editor preview to load — the theme (its id, its webfonts),
 * the font presets the header names, and the page size. One place, so the
 * assembled file (Node and browser), the page's read view and the preview
 * frame name the same stylesheets.
 *
 * Only the header decides (never anything but the text), through
 * `resolveSettings` (DEFAULTS ← the header `template`'s layout layer ← the
 * header's keys; the body is not parsed). An absent or unknown theme is the
 * default theme.
 *
 * Isomorphic: no Node built-ins, no clock, no environment.
 */
import { PREVIEW_CDN } from 'orz-markdown/preview-frame';
import { escapeAttr, escapeHtml } from 'orz-markdown/carrier/read';
import { resolveSettings } from './doc/settings.js';
import { fontPreset } from './doc/fonts.js';
import { DEFAULT_THEME, isThemeId, themeFontUrls } from './themes.js';
import type { DocSettings, ThemeName } from './types.js';

/** What the header asks for, resolved. */
export interface Presentation {
  /** The theme (the default one when the header names none or an unknown one). */
  theme: ThemeName;
  /** The webfont stylesheets of the theme and of the header's font presets, deduplicated, in order. */
  fontUrls: string[];
  /** The page size (`A4`, `Letter`, … or a custom CSS size). */
  pageSize: string;
}

/** The presentation of resolved settings. */
export function presentationOfSettings(s: DocSettings): Presentation {
  const theme: ThemeName = isThemeId(s.theme) ? s.theme : DEFAULT_THEME;
  const urls: string[] = [];
  const add = (u: string | undefined): void => {
    if (u && !urls.includes(u)) urls.push(u);
  };
  themeFontUrls(theme).forEach(add);
  for (const p of [s.fontPreset, s.fontHeadingPreset, s.fontMarginBoxPreset]) if (p) add(fontPreset(p).cssUrl);
  return { theme, fontUrls: urls, pageSize: String(s.pageSize) };
}

/** The presentation of a text, from its header only. */
export function presentationOf(text: string): Presentation {
  return presentationOfSettings(resolveSettings(text));
}

/** The ids of the shell's stylesheet links (`shellHead`): KaTeX, highlight.js; the fonts carry `data-orz-font`. */
export const SHELL_STYLESHEETS = Object.freeze(['orz-katex', 'orz-hljs'] as const);

/**
 * The shell's `<head>` part for a presentation: viewport, colour scheme
 * (paper is light), KaTeX's stylesheet (`#orz-katex`), the light highlight.js
 * stylesheet (`#orz-hljs`) — the pinned URLs of orz-markdown's preview frame
 * — and the presentation's webfont stylesheets (`data-orz-font`). The theme
 * and page CSS are not links: Paged.js applies them (the engine carries
 * every theme, so a `cdn` file styles the same, D-50).
 *
 * `deferred` (the assembled file): the stylesheets are written with
 * `media="not all"` — fetched, but blocking neither the first paint nor the
 * inline engine (a slow or unreachable CDN would otherwise hold the whole
 * page blank) — and the read view switches them on when it presents the
 * document. No inline handler is needed.
 */
export function shellHead(p: Presentation, o: { deferred?: boolean } = {}): string {
  const media = o.deferred ? ' media="not all"' : '';
  return [
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    `<link rel="stylesheet" id="orz-katex" href="${escapeAttr(PREVIEW_CDN.katexCss)}"${media}>`,
    `<link rel="stylesheet" id="orz-hljs" href="${escapeAttr(PREVIEW_CDN.hljsLightCss)}"${media}>`,
    ...p.fontUrls.map((u) => `<link rel="stylesheet" data-orz-font href="${escapeAttr(u)}"${media}>`),
  ].join('\n');
}

/**
 * What `#orz-pages` holds until the engine lays out the pages: one constant,
 * quiet line for a reader whose browser cannot run the engine (the read view
 * replaces it). The same for every document of a delivery: an inline file
 * carries its engine; a cdn file loads it from the web, so its line names the
 * connection first ({@link FALLBACK_LINE_CDN}).
 */
export const FALLBACK_LINE = 'If this page stays blank, open it in a recent browser; the document\'s text is inside this file — see the comment at the top.';

/** The fallback line of a cdn file (its engine comes from jsDelivr). */
export const FALLBACK_LINE_CDN = 'If this page stays blank, check your connection (this page loads its engine from the web) or open it in a recent browser; the document\'s text is inside this file — see the comment at the top.';

/** The id of the element the pages are laid out into (the read view, print-ready). */
export const PAGES_ID = 'orz-pages';

/**
 * The read view's markup: the page lays the document out as Paged.js pages
 * in `#orz-pages` (in the page, not an iframe: it prints as it shows); until
 * then it holds the fallback line of the delivery.
 */
export function readViewMarkup(p: Presentation, delivery: 'inline' | 'cdn' = 'inline'): string {
  const line = delivery === 'cdn' ? FALLBACK_LINE_CDN : FALLBACK_LINE;
  return `<main id="orz-view" class="orz-view" data-orz-theme="${escapeAttr(p.theme)}"><div id="${PAGES_ID}" class="orz-pages" data-orz-copy><p class="orz-fallback" style="opacity:.6;font:14px/1.5 system-ui,sans-serif;max-width:40em;margin:2em auto;padding:0 1em">${escapeHtml(line)}</p></div></main>`;
}

/**
 * The editor preview frame's presentation (FC-19 §8.4 `preview.head`,
 * `scheme`, `articleClass`; the kit's `followPresentation` rebuilds the frame
 * when it changes): the webfont stylesheets of the theme and the header's
 * presets in the head, the light scheme, and an article class naming the
 * theme and the page size.
 */
export function previewPresentation(p: Presentation): { head: string; scheme: 'light'; articleClass: string } {
  const size = p.pageSize.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    head: p.fontUrls.map((u) => `<link rel="stylesheet" href="${escapeAttr(u)}">`).join(''),
    scheme: 'light',
    articleClass: `orz-paged-preview orz-theme-${p.theme} orz-size-${size}`,
  };
}
