/**
 * KIND-SPECIFIC (paged): the header settings the chrome offers (REBUILD §3b
 * decision 2) — in the read view as submenus of the pencil's list, in the
 * editor as toolbar pickers (`attachSettings`); choosing writes the header
 * (document data, one undoable edit). Theme (the print themes), Page size
 * (the named sizes), Template (page size) (the header's `template`: layout
 * defaults only, the page size — never the starter's title page), Page numbers (where)
 * and Number style (how), and Version (the dynamic choices the document
 * defines: offered only while it defines some, its choices read at each
 * opening, writing the header's multi-line `dynamic_choices` map — the kit's
 * `choicesFor` / `apply` / `hidden`, 2.3.0). Margins, fonts and custom CSS
 * stay in the header text.
 */
import type { SettingChoice, SettingControl } from 'orz-markdown/carrier/app';
import type { KindIcon } from 'orz-markdown/carrier/shell';
import { resolveSettings } from '../../doc/settings.js';
import { canonicalTemplate, resolveTemplate, templateList } from '../../doc/templates.js';
import { presentationOf } from '../../presentation.js';
import { themeChoices } from './themes.js';
import { versionChange, versionChoices, versionsHiddenAsker } from './versions.js';

/**
 * The paged settings' own icons (`KindIcon`: path data on the 24×24 grid; the
 * kit has no icon for these): every item of the handle's list has one
 * (round 4).
 */
export const PAGED_ICONS = Object.freeze({
  /** Template: a page laid out in blocks. */
  template: { paths: ['M5 3h14v18H5z', 'M5 9h14', 'M11 9v12'] },
  /** Page numbers: a page with its number at the foot. */
  pageNumbers: { paths: ['M6 3h12v18H6z', 'M10.5 17h3'] },
  /** Number style: the number sign. */
  numberStyle: { paths: ['M10 4L8 20', 'M16 4l-2 16', 'M5 9h15', 'M4 15h15'] },
  /** Version: two versions of a page. */
  version: { paths: ['M9 3h10v14H9z', 'M5 7v14h10'] },
  /** Page zoom: a magnifier with a plus. */
  pageZoom: { paths: ['M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13z', 'M15.5 15.5L20 20', 'M8 10.5h5', 'M10.5 8v5'] },
} satisfies Record<string, KindIcon>);

/** The page sizes offered (the header also takes a custom CSS size, which no choice checks). */
export const PAGE_SIZES: ReadonlyArray<{ value: string; label: string }> = Object.freeze([
  { value: 'A4', label: 'A4 (210 × 297 mm)' },
  { value: 'Letter', label: 'Letter (8.5 × 11 in)' },
  { value: 'A5', label: 'A5 (148 × 210 mm)' },
  { value: 'Legal', label: 'Legal (8.5 × 14 in)' },
  { value: 'A3', label: 'A3 (297 × 420 mm)' },
]);

/** Where the page number goes (`page_number_position`). */
export const PAGE_NUMBER_POSITIONS: ReadonlyArray<{ value: string; label: string }> = Object.freeze([
  { value: 'footer-center', label: 'Bottom center' },
  { value: 'footer-right', label: 'Bottom right' },
  { value: 'footer-left', label: 'Bottom left' },
  { value: 'header-center', label: 'Top center' },
  { value: 'header-right', label: 'Top right' },
  { value: 'header-left', label: 'Top left' },
  { value: 'none', label: 'None' },
]);

/** How the page number reads (`page_number_style`). */
export const PAGE_NUMBER_STYLES: ReadonlyArray<{ value: string; label: string }> = Object.freeze([
  { value: 'simple', label: '1' },
  { value: 'page-n', label: 'Page 1' },
  { value: 'page-n-of-N', label: 'Page 1 of N' },
  { value: 'n-of-N', label: '1 of N' },
  { value: 'n-slash-N', label: '1 / N' },
  { value: 'dash-n-dash', label: '— 1 —' },
  { value: 'brackets', label: '[1]' },
  { value: 'parentheses', label: '(1)' },
]);

/** The Template setting's name: it sets the template's layout defaults (the page size), not its starter text (D-103). */
export const TEMPLATE_SETTING_LABEL = 'Template (page size)';

/** The Template setting's choices: each template id with the page size it sets (`report-page — Letter`). */
export function templateChoices(): Array<{ value: string; label: string }> {
  return templateList().map((t) => ({ value: t.id, label: `${t.id} — ${String(resolveTemplate(t.id).pageSize ?? '')}` }));
}

/** The Version choice that removes a key (no choice made: the document as written). */
export const VERSION_DEFAULT_LABEL = 'default';

/** A Version choice's value: the choice key and its value (null: "default", the key removed). */
const versionValue = (key: string, value: string | null): string => JSON.stringify([key, value]);

/**
 * Version (REBUILD §3b guide 6): one choice per value of each dynamic choice
 * key the document defines ("answer key: show", …, "answer key: default" —
 * the key not set: the document as written, no choice made; round 4,
 * "(not set)" read oddly),
 * a separator between keys, the header's values checked; choosing one writes
 * `dynamic_choices` (one undoable header edit). Hidden while the document
 * defines none.
 */
export const VERSION_SETTING: SettingControl = {
  key: 'dynamic_choices',
  label: 'Version',
  icon: PAGED_ICONS.version,
  choices: [],
  current: () => '',
  choicesFor(text: string): SettingChoice[] {
    const out: SettingChoice[] = [];
    versionChoices(text).forEach((c, i) => {
      [...c.values, null].forEach((v, j) => {
        out.push({ value: versionValue(c.key, v), label: `${c.label}: ${v ?? VERSION_DEFAULT_LABEL}`, checked: c.current === v, ...(i > 0 && j === 0 ? { separator: true } : {}) });
      });
    });
    return out;
  },
  apply(text: string, value: string) {
    const [key, v] = JSON.parse(value) as [string, string | null];
    return versionChoices(text).find((c) => c.key === key)?.current === v ? {} : versionChange(text, key, v);
  },
  // cheap: a header/text test, never a render (typing stays fast; K.6) — the full render is `choicesFor`'s, at each opening;
  // a new function after a render changed what a text offers, so the kit's per-text memo asks again (K.8)
  get hidden() { return versionsHiddenAsker(); },
};

export const PAGED_SETTINGS: readonly SettingControl[] = Object.freeze([
  {
    key: 'theme',
    label: 'Theme',
    icon: 'theme',
    get choices() { return themeChoices(); },
    current: (text: string) => presentationOf(text).theme,
  },
  {
    key: 'page_size',
    label: 'Page size',
    icon: 'pageSize',
    choices: PAGE_SIZES,
    current: (text: string) => String(resolveSettings(text).pageSize),
  },
  // The header's `template` key sets layout defaults only — the page size — and never adds the starter's title page or
  // content: the item says so ("Template (page size)", "report-page — Letter"); the starters are New document from
  // template… (D-103; the honest, smaller change)
  {
    key: 'template',
    label: TEMPLATE_SETTING_LABEL,
    icon: PAGED_ICONS.template,
    choices: templateChoices(),
    current: (text: string) => canonicalTemplate(String(resolveSettings(text).template ?? '')) ?? '',
  },
  {
    key: 'page_number_position',
    label: 'Page numbers',
    icon: PAGED_ICONS.pageNumbers,
    choices: PAGE_NUMBER_POSITIONS,
    current: (text: string) => resolveSettings(text).pageNumberPosition,
  },
  {
    key: 'page_number_style',
    label: 'Number style',
    icon: PAGED_ICONS.numberStyle,
    choices: PAGE_NUMBER_STYLES,
    current: (text: string) => resolveSettings(text).pageNumberStyle,
  },
  VERSION_SETTING,
] as SettingControl[]);
