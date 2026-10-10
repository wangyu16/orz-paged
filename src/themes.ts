/**
 * The paged themes — the one list of this repository (FC-18 §5.1: the header's
 * `theme` key names one of these ids).
 *
 * Nine print themes, one per light orz-markdown theme and with the same id
 * (REBUILD §3b guide 3, D-42), DERIVED at build time by
 * scripts/build-themes.ts from the installed orz-markdown's theme files: the
 * source theme's decoration adapted for paper (assets/themes/README.md), plus
 * `none` (a plain print look for documents that style themselves).
 *
 * API (isomorphic: no Node built-ins; paths are package-relative):
 *
 *   THEMES: readonly ThemeName[]       ids in the picker's order (orz-markdown's), `none` last
 *   DEFAULT_THEME: ThemeName           the theme of a document whose header names none
 *   isThemeId(id): id is ThemeName
 *   THEME_INFO: readonly PagedTheme[]  id, label, source theme, stylesheet, fonts — per theme
 *   themeInfo(id): PagedTheme          the theme `id` names, else the default theme
 *   BASE_STYLESHEET                    'assets/themes/base.css' — structure, loaded for every theme
 *   themeStylesheet(id): string        'assets/themes/<id>.css' ('assets/themes/plain/none.css' for none)
 *   themeStylesheets(id): string[]     [base, theme] — the order to load them (page CSS goes last)
 *   themeFontUrls(id): string[]        webfont stylesheets to <link> before paginating
 *   cdnUrl(path, version): string      jsDelivr URL of a package file (e.g. a stylesheet)
 *
 * Reading the CSS text in Node: `readFileSync(join(packageRoot, themeStylesheet(id)))`
 * (the package ships assets/themes). The browser bundle carries them as text
 * (build/bundle.ts, the virtual module `orz-paged:themes`).
 *
 * Load order: base.css, then the theme, then the document's page CSS (which
 * may override --page-bg / --accent / --font-* from the header).
 */
import { THEMES as SOURCE_THEMES } from 'orz-markdown/themes';
import { THEME_FONTS } from './doc/theme-fonts.js';
import { DEFAULTS } from './doc/settings.js';
import type { ThemeName } from './types.js';

export interface PagedTheme {
  /** The theme id (the header's `theme` value). */
  readonly id: ThemeName;
  /** The name a theme picker shows (orz-markdown's name for the source theme). */
  readonly label: string;
  /** The orz-markdown theme it derives from (`orz-markdown/themes/<source>.css`); null for `none`. */
  readonly source: string | null;
  /** Package-relative path of its stylesheet (load after {@link BASE_STYLESHEET}). */
  readonly stylesheet: string;
  /** Webfont stylesheet URLs (CDN) its typography needs. */
  readonly fonts: readonly string[];
}

/** The structure stylesheet every theme loads first (orz-markdown common.css adapted for pages + paged structure). */
export const BASE_STYLESHEET = 'assets/themes/base.css';

const derived: PagedTheme[] = SOURCE_THEMES.filter((t) => t.scheme === 'light' && t.id in THEME_FONTS).map((t) =>
  Object.freeze({
    id: t.id as ThemeName,
    label: t.name,
    source: t.id,
    stylesheet: `assets/themes/${t.id}.css`,
    fonts: THEME_FONTS[t.id as ThemeName].css,
  }),
);

/** Every theme, in the picker's order: orz-markdown's light themes, then `none`. */
export const THEME_INFO: readonly PagedTheme[] = Object.freeze([
  ...derived,
  Object.freeze({ id: 'none' as ThemeName, label: 'Plain', source: null, stylesheet: 'assets/themes/plain/none.css', fonts: THEME_FONTS.none.css }),
]);

/** Theme ids, in the picker's order. */
export const THEMES: readonly ThemeName[] = Object.freeze(THEME_INFO.map((t) => t.id));

/** The theme a document without a `theme` key shows. */
export const DEFAULT_THEME: ThemeName = DEFAULTS.theme;

/** Whether `id` is a paged theme id. */
export function isThemeId(id: unknown): id is ThemeName {
  return typeof id === 'string' && (THEMES as readonly string[]).includes(id);
}

/** The theme `id` names, else the default theme. */
export function themeInfo(id: string | null | undefined): PagedTheme {
  return THEME_INFO.find((t) => t.id === id) ?? THEME_INFO.find((t) => t.id === DEFAULT_THEME)!;
}

/** Package-relative path of the theme's stylesheet (unknown ids → the default theme's). */
export function themeStylesheet(id: string | null | undefined): string {
  return themeInfo(id).stylesheet;
}

/** The stylesheets a theme needs, in load order (the document's page CSS goes after them). */
export function themeStylesheets(id: string | null | undefined): string[] {
  return [BASE_STYLESHEET, themeStylesheet(id)];
}

/** Webfont stylesheet URLs the theme's typography needs (empty for `none`). */
export function themeFontUrls(id: string | null | undefined): readonly string[] {
  return themeInfo(id).fonts;
}

/** jsDelivr URL of a file of the published orz-paged package, e.g. `cdnUrl(themeStylesheet(id), VERSION)`. */
export function cdnUrl(path: string, version: string): string {
  return `https://cdn.jsdelivr.net/npm/orz-paged@${version}/${path}`;
}
