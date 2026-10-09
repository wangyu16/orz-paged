/**
 * The paged themes a document may name in its header `theme` key (FC-18
 * §5.1): the one list of this repository — the stylesheets in assets/themes
 * (plus `none`, plain), each with the webfonts it owns (src/doc/theme-fonts.ts).
 * The 9 themes derived from orz-markdown's light themes (REBUILD §3b, guide 3,
 * D-42) replace these 7 in a later rebuild step; until then this list is what
 * the engine renders.
 *
 * Isomorphic: no Node built-ins.
 */
import { THEME_FONTS } from './doc/theme-fonts.js';
import { DEFAULTS } from './doc/settings.js';
import type { ThemeName } from './types.js';

/** Theme ids, in the picker's order. */
export const THEMES: readonly ThemeName[] = Object.freeze(Object.keys(THEME_FONTS) as ThemeName[]);

/** The theme a document without a `theme` key shows. */
export const DEFAULT_THEME: ThemeName = DEFAULTS.theme;

/** Whether `id` is a paged theme id. */
export function isThemeId(id: unknown): id is ThemeName {
  return typeof id === 'string' && (THEMES as readonly string[]).includes(id);
}
