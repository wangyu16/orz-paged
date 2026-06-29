/**
 * Theme typography — each theme OWNS its font (alongside its colors + element
 * style in the theme CSS). The engine loads the active theme's webfonts at view
 * time and the theme CSS sets the matching `--font-body` / `--font-heading`, so
 * the same theme yields the same font across every template. An explicit
 * `font_preset` in the document settings still overrides this (page CSS wins).
 */
import type { ThemeName, FontPresetName } from '../types.js';

export const THEME_FONTS: Record<ThemeName, { body: FontPresetName; heading: FontPresetName }> = {
  none: { body: 'system-serif', heading: 'system-serif' },
  'light-neat-1': { body: 'inter', heading: 'inter' },
  'light-neat-2': { body: 'ibm-plex-sans', heading: 'ibm-plex-sans' },
  'light-neat-3': { body: 'raleway', heading: 'raleway' },
  'light-academic-1': { body: 'source-serif-4', heading: 'source-serif-4' },
  'light-academic-2': { body: 'crimson-pro', heading: 'inter' },
  'beige-decent-1': { body: 'lora', heading: 'lora' },
  'beige-decent-2': { body: 'noto-serif', heading: 'noto-serif' },
};
