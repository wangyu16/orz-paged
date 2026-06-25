/**
 * Font presets — M3.
 *
 * Maps each curated {@link FontPresetName} to a {@link FontPreset}: a CDN
 * stylesheet URL (`@fontsource/*` served via jsDelivr) plus the matching CSS
 * `font-family` stack. orz-paged assumes internet access, so fonts load from
 * the CDN rather than being bundled.
 *
 * `system-serif` is the one preset with **no** webfont — it relies on the
 * platform's Times-style serif and ships an empty `cssUrl`.
 *
 * Source of truth for the curated list: `docs/document-model.md` (Tier A) and
 * `src/types.ts` (`FontPresetName`).
 */

import type { FontPreset, FontPresetName } from '../types.js';

/** jsDelivr `@fontsource` stylesheet for a given package id (major v5). */
function fontsourceUrl(id: string): string {
  return `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/index.css`;
}

/** Times-style fallback stack for the webfont-less `system-serif` preset. */
const SYSTEM_SERIF_FAMILY =
  '"Times New Roman", Times, Georgia, "Liberation Serif", serif';

/**
 * Every curated preset → its CDN stylesheet + CSS family stack. `system-serif`
 * carries an empty `cssUrl` (no network font).
 */
export const FONT_PRESETS: Record<FontPresetName, FontPreset> = {
  'system-serif': {
    cssUrl: '',
    family: SYSTEM_SERIF_FAMILY,
  },
  'source-serif-4': {
    cssUrl: fontsourceUrl('source-serif-4'),
    family: '"Source Serif 4", Georgia, "Times New Roman", serif',
  },
  lora: {
    cssUrl: fontsourceUrl('lora'),
    family: '"Lora", Georgia, "Times New Roman", serif',
  },
  'crimson-pro': {
    cssUrl: fontsourceUrl('crimson-pro'),
    family: '"Crimson Pro", Georgia, "Times New Roman", serif',
  },
  'noto-serif': {
    cssUrl: fontsourceUrl('noto-serif'),
    family: '"Noto Serif", Georgia, "Times New Roman", serif',
  },
  inter: {
    cssUrl: fontsourceUrl('inter'),
    family: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  'ibm-plex-sans': {
    cssUrl: fontsourceUrl('ibm-plex-sans'),
    family: '"IBM Plex Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  roboto: {
    cssUrl: fontsourceUrl('roboto'),
    family: '"Roboto", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  raleway: {
    cssUrl: fontsourceUrl('raleway'),
    family: '"Raleway", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  'noto-sans': {
    cssUrl: fontsourceUrl('noto-sans'),
    family: '"Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  'courier-prime': {
    cssUrl: fontsourceUrl('courier-prime'),
    family: '"Courier Prime", "Courier New", Courier, monospace',
  },
};

/** Sensible fallback for an unknown preset name: the webfont-less system serif. */
const SYSTEM_FALLBACK: FontPreset = {
  cssUrl: '',
  family: SYSTEM_SERIF_FAMILY,
};

/**
 * Resolve a preset by name. Unknown names fall back to a webfont-less system
 * serif (empty `cssUrl`) rather than throwing.
 */
export function fontPreset(name: string): FontPreset {
  const preset = FONT_PRESETS[name as FontPresetName];
  return preset ?? SYSTEM_FALLBACK;
}
