/**
 * Document settings.
 *
 * The settings source is the FC-18 document header (orz-markdown's
 * `readHeader`, the one flat nyml reader every carrier shares; keys
 * `KIND_HEADER_KEYS.paged` plus the common `theme`). This module normalizes the
 * header's snake_case keys into a {@link DocSettingsLayer} and merges
 * template + user layers over {@link DEFAULTS} into a fully-resolved
 * {@link DocSettings}: defaults ← template layer ← header.
 *
 * Text format 1 (rebuild step 2): the 0.x raw-string `parseDocSettings` and its
 * private nyml parser are gone. A `kind: document` block that is not the header
 * (not leading the text) is no settings source; lint reports it
 * (`stray-document-block`), and `upgrade` moves a 0.x file's block to the top.
 *
 * Source of truth for defaults and aliases: `archive/document-model.md`
 * (the curated subset; see archive/DESIGN.md §8).
 */

import { readHeader, withoutHeader, type Header } from 'orz-markdown/carrier';
import type {
  DocSettings,
  RawDocSettings,
  DocSettingsLayer,
  PageSize,
  PageNumberPosition,
  PageNumberStyle,
  FontPresetName,
  ThemeName,
  TemplateName,
} from '../types.js';
import { resolveTemplate } from './templates.js';

/* ─────────────────────────── defaults ─────────────────────────── */

/** Every field at its documented default (archive/document-model.md). */
export const DEFAULTS: DocSettings = {
  // page
  pageSize: 'A4',
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 20,
  marginRight: 20,

  // typography — fontPreset / decorationColor intentionally unset so a theme's
  // own font + accent apply by default; an explicit setting (or a template)
  // overrides them (page CSS is added last and only emits a token when set).
  fontSize: 12,
  lineHeight: 1.5,

  // page numbers
  pageNumberPosition: 'footer-center',
  pageNumberStyle: 'simple',
  pageNumberStartPage: 1,
  firstPageSkipNumber: false,

  // running headers / footers
  headerLeft: '',
  headerCenter: '',
  headerRight: '',
  headerRule: true,
  headerFontSize: 9,
  footerLeft: '',
  footerCenter: '',
  footerRight: '',
  footerRule: true,
  footerFontSize: 9,
  firstPageHideHeader: false,
  firstPageHideFooter: false,
  frontMatterClean: false,

  // layout behavior
  limitImageToPage: true,
  keepImageTogether: true,
  repeatTableHeader: true,
  avoidTableRowBreaks: true,

  // theme — the default look (font + accent + element style) when a document
  // doesn't pick one. Templates set layout only, never a theme.
  theme: 'light-academic-1',

  // dynamic switch — empty by default (no conditional content removed).
  dynamicChoices: {},
};

/* ─────────────────────────── reading ─────────────────────────── */

/**
 * The settings of a text: its FC-18 header's fields (`raw`, read by the kit's
 * flat nyml reader: `kind` excluded, quotes removed, `|` values dedented; a
 * legacy `kind: meta` header or meta+document pair is read as the kit reads it)
 * and the body to render (`withoutHeader(text).body`). A text without a header
 * gives `{ raw: {}, body: text, header: null }`.
 */
export function readSettings(text: string): { raw: RawDocSettings; body: string; header: Header | null } {
  const header = readHeader(text);
  if (!header) return { raw: {}, body: text, header: null };
  return { raw: { ...header.fields }, body: withoutHeader(text).body, header };
}

/**
 * The resolved settings of a text: DEFAULTS ← the layer of the header's
 * `template` (layout defaults only) ← the header's own keys.
 */
export function resolveSettings(text: string): DocSettings {
  const { raw } = readSettings(text);
  return mergeSettings(DEFAULTS, resolveTemplate(String(raw.template ?? '') as TemplateName), normalizeRawToLayer(raw));
}

/* ─────────────────────────── normalization ─────────────────────────── */

const PAGE_SIZE_ALIASES: Record<string, PageSize> = {
  a3: 'A3',
  a4: 'A4',
  a5: 'A5',
  letter: 'Letter',
  legal: 'Legal',
};

function normPageSize(v: string): PageSize {
  const key = v.trim().toLowerCase();
  return PAGE_SIZE_ALIASES[key] ?? v.trim();
}

function toNumber(v: string | number | boolean): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

function toBool(v: string | number | boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'on';
}

function toStr(v: string | number | boolean): string {
  return String(v);
}

/**
 * Map snake_case raw keys → camelCase {@link DocSettings} fields, coercing
 * types and normalizing aliases. Only keys present in `raw` are included;
 * unknown keys (DocMeta, host keys, misspellings — lint names the latter) are
 * ignored.
 */
export function normalizeRawToLayer(raw: RawDocSettings): DocSettingsLayer {
  const out: DocSettingsLayer = {};

  const setNum = (key: keyof DocSettings, v: string | number | boolean) => {
    const n = toNumber(v);
    if (n !== undefined) (out as Record<string, unknown>)[key] = n;
  };
  const setBool = (key: keyof DocSettings, v: string | number | boolean) => {
    (out as Record<string, unknown>)[key] = toBool(v);
  };
  const setStr = (key: keyof DocSettings, v: string | number | boolean) => {
    (out as Record<string, unknown>)[key] = toStr(v);
  };

  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;

    switch (k) {
      // page
      case 'page_size':
        out.pageSize = normPageSize(toStr(v));
        break;
      case 'margin_top':
        setNum('marginTop', v);
        break;
      case 'margin_bottom':
        setNum('marginBottom', v);
        break;
      case 'margin_left':
        setNum('marginLeft', v);
        break;
      case 'margin_right':
        setNum('marginRight', v);
        break;
      case 'page_background':
        setStr('pageBackground', v);
        break;

      // typography
      case 'font_preset':
        out.fontPreset = toStr(v).trim() as FontPresetName;
        break;
      case 'font_family':
        setStr('fontFamily', v);
        break;
      case 'font_heading_preset':
        out.fontHeadingPreset = toStr(v).trim() as FontPresetName;
        break;
      case 'font_margin_box_preset':
        out.fontMarginBoxPreset = toStr(v).trim() as FontPresetName;
        break;
      case 'font_size':
        setNum('fontSize', v);
        break;
      case 'line_height':
        setNum('lineHeight', v);
        break;
      case 'decoration_color':
        setStr('decorationColor', v);
        break;

      // page numbers
      case 'page_number_position':
        out.pageNumberPosition = toStr(v).trim() as PageNumberPosition;
        break;
      case 'page_number_style':
        out.pageNumberStyle = toStr(v).trim() as PageNumberStyle;
        break;
      case 'page_number_start_page':
        setNum('pageNumberStartPage', v);
        break;
      case 'first_page_skip_number':
        setBool('firstPageSkipNumber', v);
        break;

      // headers / footers
      case 'header_left':
        setStr('headerLeft', v);
        break;
      case 'header_center':
        setStr('headerCenter', v);
        break;
      case 'header_right':
        setStr('headerRight', v);
        break;
      case 'header_rule':
        setBool('headerRule', v);
        break;
      case 'header_rule_color':
        setStr('headerRuleColor', v);
        break;
      case 'header_font_size':
        setNum('headerFontSize', v);
        break;
      case 'footer_left':
        setStr('footerLeft', v);
        break;
      case 'footer_center':
        setStr('footerCenter', v);
        break;
      case 'footer_right':
        setStr('footerRight', v);
        break;
      case 'footer_rule':
        setBool('footerRule', v);
        break;
      case 'footer_rule_color':
        setStr('footerRuleColor', v);
        break;
      case 'footer_font_size':
        setNum('footerFontSize', v);
        break;
      case 'first_page_hide_header':
        setBool('firstPageHideHeader', v);
        break;
      case 'first_page_hide_footer':
        setBool('firstPageHideFooter', v);
        break;
      case 'front_matter':
      case 'front_matter_clean': {
        const fm = toStr(v).toLowerCase();
        (out as Record<string, unknown>).frontMatterClean =
          fm === 'clean' || fm === 'plain' || toBool(v);
        break;
      }

      // layout behavior
      case 'limit_image_to_page':
        setBool('limitImageToPage', v);
        break;
      case 'keep_image_together':
        setBool('keepImageTogether', v);
        break;
      case 'repeat_table_header':
        setBool('repeatTableHeader', v);
        break;
      case 'avoid_table_row_breaks':
        setBool('avoidTableRowBreaks', v);
        break;

      // theme / template / escape hatch
      case 'theme':
        out.theme = toStr(v).trim() as ThemeName;
        break;
      case 'template':
        out.template = toStr(v).trim() as TemplateName;
        break;
      case 'custom_css':
        setStr('customCss', v);
        break;
      case 'dynamic_choices': {
        // multiline `key: value` map → object with normalized keys
        // (lowercase, hyphens → underscores), matching data-*-when resolution.
        const map: Record<string, string> = {};
        for (const line of toStr(v).split(/\r?\n/)) {
          const idx = line.indexOf(':');
          if (idx < 0) continue;
          const key = line.slice(0, idx).trim().toLowerCase().replace(/-/g, '_');
          if (key) map[key] = line.slice(idx + 1).trim();
        }
        (out as Record<string, unknown>).dynamicChoices = map;
        break;
      }

      default:
        // unknown key — ignore
        break;
    }
  }

  return out;
}

/* ─────────────────────────── merging ─────────────────────────── */

/**
 * Shallow-merge layers left → right (later wins). Intended use:
 * `mergeSettings(DEFAULTS, templateLayer, userLayer)`.
 */
export function mergeSettings(...layers: DocSettingsLayer[]): DocSettings {
  const out = { ...DEFAULTS };
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) {
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}
