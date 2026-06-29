/**
 * Curated document templates — LAYOUT defaults + a starter skeleton.
 *
 * Responsibility split: a **template** owns layout only (page size, margins,
 * furniture, and which elements appear / where). A **theme** owns the look —
 * font, accent/decoration color, and element styling — so the same theme renders
 * the same across every template (see ../doc/theme-fonts.ts + assets/themes/*).
 * The default theme is `light-academic-1` (settings.ts DEFAULTS.theme).
 *
 * Each template carries:
 *   - a {@link DocSettingsLayer} of *layout defaults* (page size; no font/theme),
 *     merged under any `kind: document` field the user sets,
 *   - picker metadata (`label`, `description`, `group`),
 *   - a `skeleton` stem naming the starter Markdown in `assets/templates/<stem>.md`.
 *
 * `article` / `report` / `exam` ship in two variants — `-page` (a dedicated
 * title/cover page) and `-section` (title-on-content) — that differ only in their
 * skeleton (the title element's `placement: page | section`). Legacy names
 * (`article`/`report`/`exam`) resolve to the `-section` variant.
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

// Templates set LAYOUT only (page size, margins, furniture). Font, accent, and
// element style come from the theme — so the same theme looks the same across
// every template. A document still overrides any of this in its settings block.
const ARTICLE_SETTINGS: DocSettingsLayer = { pageSize: 'Letter' };
const REPORT_SETTINGS: DocSettingsLayer = { pageSize: 'Letter' };
const EXAM_SETTINGS: DocSettingsLayer = { pageSize: 'Letter' };

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
    settings: { template: 'letter', pageSize: 'Letter' },
  },
  'cover-letter': {
    label: 'Cover letter',
    description: 'Job cover letter: sender header, recipient, body, sign-off.',
    group: 'Letter',
    skeleton: 'cover-letter',
    settings: { template: 'cover-letter', pageSize: 'Letter' },
  },

  cv: {
    label: 'CV — classic',
    description: 'Résumé: name/contact header and clean sectioned body.',
    group: 'CV',
    skeleton: 'cv',
    settings: { template: 'cv', pageSize: 'Letter' },
  },
  'cv-modern': {
    label: 'CV — modern',
    description: 'Accent name + rule, uppercase section labels, right-aligned dates, skill chips.',
    group: 'CV',
    skeleton: 'cv-modern',
    settings: { template: 'cv-modern', pageSize: 'Letter' },
  },
  'cv-elegant': {
    label: 'CV — elegant',
    description: 'Centered, letter-spaced name, hairline rules, two-column "ledger" entries.',
    group: 'CV',
    skeleton: 'cv-elegant',
    settings: { template: 'cv-elegant', pageSize: 'Letter' },
  },

  note: {
    label: 'Note',
    description: 'Clean readable note: minimal furniture on A4.',
    group: 'Note',
    skeleton: 'note',
    settings: { template: 'note', pageSize: 'A4' },
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
