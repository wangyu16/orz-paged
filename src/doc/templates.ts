/**
 * Curated document templates — settings defaults + a starter skeleton.
 *
 * Each template carries:
 *   - a {@link DocSettingsLayer} of *defaults* (page size, fonts, theme) merged
 *     under any `kind: document` field the user sets (DESIGN §8 "template-first"),
 *   - picker metadata (`label`, `description`, `group`),
 *   - a `skeleton` stem naming the starter Markdown in `assets/templates/<stem>.md`.
 *
 * `article` / `report` / `exam` ship in two variants — `-page` (a dedicated
 * title/cover page) and `-section` (title-on-content) — that differ only in their
 * skeleton (the title element's `placement: page | section`); their settings are
 * the same. Legacy names (`article`/`report`/`exam`) resolve to the `-section`
 * variant so older sources keep working.
 *
 *   article  Letter · serif (system-serif) · light-academic-1
 *   report   Letter · sans  (inter)         · light-neat-1
 *   exam     Letter · serif (noto-serif)    · none
 *   letter   Letter · serif (source-serif-4)· none
 *   cv       Letter · sans  (ibm-plex-sans) · none
 *   note     A4     · serif (lora)          · light-academic-2
 */

import type { TemplateName, DocSettingsLayer } from '../types.js';

export interface TemplateDef {
  /** Friendly name for the picker, e.g. "Article — title page". */
  label: string;
  /** One-line description (picker tooltip). */
  description: string;
  /** Grouping for the picker, e.g. "Article". */
  group: string;
  /** Starter-markdown file stem: `assets/templates/<skeleton>.md`. */
  skeleton: string;
  /** Settings defaults this template applies. */
  settings: DocSettingsLayer;
}

const ARTICLE_SETTINGS: DocSettingsLayer = {
  pageSize: 'Letter',
  fontPreset: 'system-serif',
  theme: 'light-academic-1',
};
const REPORT_SETTINGS: DocSettingsLayer = {
  pageSize: 'Letter',
  fontPreset: 'inter',
  fontHeadingPreset: 'inter',
  theme: 'light-neat-1',
};
const EXAM_SETTINGS: DocSettingsLayer = {
  pageSize: 'Letter',
  fontPreset: 'noto-serif',
  theme: 'none',
};

/** The 10 curated templates. */
export const TEMPLATES: Record<TemplateName, TemplateDef> = {
  'article-page': {
    label: 'Article — title page',
    description: 'Academic paper with a dedicated title page, then abstract + body.',
    group: 'Article',
    skeleton: 'article-page',
    settings: { ...ARTICLE_SETTINGS, template: 'article-page' },
  },
  'article-section': {
    label: 'Article — title section',
    description: 'Academic paper with an inline title block above the body.',
    group: 'Article',
    skeleton: 'article-section',
    settings: { ...ARTICLE_SETTINGS, template: 'article-section' },
  },

  'report-page': {
    label: 'Report — title page',
    description: 'Business/technical report with a cover page, TOC, then body.',
    group: 'Report',
    skeleton: 'report-page',
    settings: { ...REPORT_SETTINGS, template: 'report-page' },
  },
  'report-section': {
    label: 'Report — title section',
    description: 'Business/technical report with an inline title block.',
    group: 'Report',
    skeleton: 'report-section',
    settings: { ...REPORT_SETTINGS, template: 'report-section' },
  },

  'exam-page': {
    label: 'Exam — cover page',
    description: 'Exam with a cover/instructions page, then numbered questions.',
    group: 'Exam',
    skeleton: 'exam-page',
    settings: { ...EXAM_SETTINGS, template: 'exam-page' },
  },
  'exam-section': {
    label: 'Exam — title section',
    description: 'Exam with an inline header block, then numbered questions.',
    group: 'Exam',
    skeleton: 'exam-section',
    settings: { ...EXAM_SETTINGS, template: 'exam-section' },
  },

  letter: {
    label: 'Letter',
    description: 'Formal letter: letterhead, inside address, body, signature.',
    group: 'Letter',
    skeleton: 'letter',
    settings: { template: 'letter', pageSize: 'Letter', fontPreset: 'source-serif-4', theme: 'none' },
  },
  'cover-letter': {
    label: 'Cover letter',
    description: 'Job cover letter: sender header, recipient, body, sign-off.',
    group: 'Letter',
    skeleton: 'cover-letter',
    settings: { template: 'cover-letter', pageSize: 'Letter', fontPreset: 'source-serif-4', theme: 'none' },
  },

  cv: {
    label: 'CV / résumé',
    description: 'Résumé: name/contact header and clean sectioned body.',
    group: 'CV',
    skeleton: 'cv',
    settings: { template: 'cv', pageSize: 'Letter', fontPreset: 'ibm-plex-sans', theme: 'none' },
  },

  note: {
    label: 'Note',
    description: 'Clean readable note: A4, serif, minimal furniture.',
    group: 'Note',
    skeleton: 'note',
    settings: { template: 'note', pageSize: 'A4', fontPreset: 'lora', theme: 'light-academic-2' },
  },
};

/** Legacy single names → their `-section` variant. */
const LEGACY_ALIASES: Record<string, TemplateName> = {
  article: 'article-section',
  report: 'report-section',
  exam: 'exam-section',
};

/** Canonicalize a (possibly legacy) template name, or `undefined` if unknown. */
export function canonicalTemplate(name: string): TemplateName | undefined {
  if (name in TEMPLATES) return name as TemplateName;
  if (name in LEGACY_ALIASES) return LEGACY_ALIASES[name];
  return undefined;
}

/** Return a template's *settings* defaults layer, or `{}` for an unknown name. */
export function resolveTemplate(name: TemplateName | string): DocSettingsLayer {
  const key = canonicalTemplate(String(name));
  return key ? TEMPLATES[key].settings : {};
}

/** The starter-markdown file stem for a template, or `undefined` if unknown. */
export function templateSkeletonName(name: TemplateName | string): string | undefined {
  const key = canonicalTemplate(String(name));
  return key ? TEMPLATES[key].skeleton : undefined;
}

/** Picker catalog: id + metadata for every template (no settings/skeleton text). */
export function templateList(): Array<{ id: TemplateName; label: string; description: string; group: string; skeleton: string }> {
  return (Object.keys(TEMPLATES) as TemplateName[]).map((id) => ({
    id,
    label: TEMPLATES[id].label,
    description: TEMPLATES[id].description,
    group: TEMPLATES[id].group,
    skeleton: TEMPLATES[id].skeleton,
  }));
}
