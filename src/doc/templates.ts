/**
 * Curated document templates — M1.
 *
 * Each template is a {@link DocSettingsLayer} of *defaults* (page size, fonts,
 * theme, and a few sensible furniture choices). A template is only a starting
 * point: any `kind: document` field a user sets overrides the template value
 * (see DESIGN.md §8 — "Template-first" two-tier UX).
 *
 * Page / body-font / theme choices follow the DESIGN §8 templates table:
 *
 *   article  Letter · serif (system-serif) · light-academic-1
 *   report   Letter · sans  (inter)         · light-neat-1
 *   letter   Letter · serif (source-serif-4)· none
 *   cv       Letter · sans  (ibm-plex-sans) · none
 *   note     A4     · serif (lora)          · light-academic-2
 *   exam     Letter · serif (noto-serif)    · none
 */

import type { TemplateName, DocSettingsLayer } from '../types.js';

/** The 6 curated templates and the defaults each one sets. */
export const TEMPLATES: Record<TemplateName, DocSettingsLayer> = {
  // Academic paper / short report: serif body, academic theme.
  article: {
    template: 'article',
    pageSize: 'Letter',
    fontPreset: 'system-serif',
    theme: 'light-academic-1',
  },

  // Business / technical report: sans body + sans headings, neat theme,
  // header/footer furniture is expected (numbers in the footer by default).
  report: {
    template: 'report',
    pageSize: 'Letter',
    fontPreset: 'inter',
    fontHeadingPreset: 'inter',
    theme: 'light-neat-1',
  },

  // Formal letter: serif body, plain (no theme); footer page number off-feel
  // for a one/two-page letter, but kept simple here — left as default.
  letter: {
    template: 'letter',
    pageSize: 'Letter',
    fontPreset: 'source-serif-4',
    theme: 'none',
  },

  // Résumé: clean sans, plain (no theme) so the cv-header element drives looks.
  cv: {
    template: 'cv',
    pageSize: 'Letter',
    fontPreset: 'ibm-plex-sans',
    theme: 'none',
  },

  // Clean readable notes: A4, serif, light structured academic theme.
  note: {
    template: 'note',
    pageSize: 'A4',
    fontPreset: 'lora',
    theme: 'light-academic-2',
  },

  // Exam / assessment: serif, plain so the question elements drive the look.
  exam: {
    template: 'exam',
    pageSize: 'Letter',
    fontPreset: 'noto-serif',
    theme: 'none',
  },
};

/** Return a template's defaults layer, or `{}` for an unknown name. */
export function resolveTemplate(name: TemplateName): DocSettingsLayer {
  return TEMPLATES[name] ?? {};
}
