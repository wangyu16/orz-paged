/**
 * KIND-SPECIFIC (paged): the header settings the chrome offers (REBUILD §3b
 * decision 2) — in the read view as submenus of the pencil's list, in the
 * editor as toolbar pickers (`attachSettings`); choosing writes the header
 * (document data, one undoable edit). Theme (the print themes), Page size
 * (the named sizes), Template (layout defaults only), Page numbers (where)
 * and Number style (how). Margins, fonts and custom CSS stay in the header
 * text. The Version picker (dynamic choices) needs a multi-line header value
 * the kit's settings cannot write: it is an action (src/browser/paged/actions.ts).
 */
import type { SettingControl } from 'orz-markdown/carrier/app';
import { resolveSettings } from '../../doc/settings.js';
import { canonicalTemplate, templateList } from '../../doc/templates.js';
import { presentationOf } from '../../presentation.js';
import { themeChoices } from './themes.js';

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
  {
    key: 'template',
    label: 'Template',
    choices: templateList().map((t) => ({ value: t.id, label: t.label })),
    current: (text: string) => canonicalTemplate(String(resolveSettings(text).template ?? '')) ?? '',
  },
  {
    key: 'page_number_position',
    label: 'Page numbers',
    choices: PAGE_NUMBER_POSITIONS,
    current: (text: string) => resolveSettings(text).pageNumberPosition,
  },
  {
    key: 'page_number_style',
    label: 'Number style',
    choices: PAGE_NUMBER_STYLES,
    current: (text: string) => resolveSettings(text).pageNumberStyle,
  },
] as SettingControl[]);
