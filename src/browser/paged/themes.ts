/**
 * KIND-SPECIFIC (paged): the theme picker's choices, from the one theme list
 * (src/themes.ts `THEME_INFO`): id, label (orz-markdown's name of the source
 * theme) and a swatch for each print theme — the kit's `themeSwatch` of the
 * source theme (its paper and signature colours split diagonally, different
 * for every theme; orz-markdown 2.5.0, STATUS D-95); `none` (no source theme)
 * plain white paper with grey.
 */
import { themeSwatch } from 'orz-markdown/themes';
import { THEME_INFO } from '../../themes.js';

/** The dot of `none` (plain print: white paper, black-and-grey text). */
const PLAIN_SWATCH = 'linear-gradient(135deg, #ffffff 50%, #6b6b6b 50%)';

/** The Theme picker's choices, in the list's order. */
export function themeChoices(): Array<{ value: string; label: string; swatch: string }> {
  return THEME_INFO.map((t) => ({ value: t.id, label: t.label, swatch: t.source ? themeSwatch(t.source) : PLAIN_SWATCH }));
}
