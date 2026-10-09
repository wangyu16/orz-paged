/**
 * KIND-SPECIFIC (paged): the theme picker's choices, from the one theme list
 * (src/themes.ts `THEME_INFO`): id, label (orz-markdown's name of the source
 * theme) and a paper swatch for each print theme.
 */
import { THEME_INFO } from '../../themes.js';

/** The paper colour a theme's swatch shows (the chrome cannot read a theme's colours without loading it). */
function swatch(id: string): string {
  return id.startsWith('beige') ? 'oklch(95% 0.03 85)' : 'oklch(99% 0.005 100)';
}

/** The Theme picker's choices, in the list's order. */
export function themeChoices(): Array<{ value: string; label: string; swatch: string }> {
  return THEME_INFO.map((t) => ({ value: t.id, label: t.label, swatch: swatch(t.id) }));
}
