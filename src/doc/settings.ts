/**
 * Document settings — M1.
 *
 * Reads the single `{{nyml kind: document}}` block from a Markdown source,
 * normalizes its snake_case keys into a {@link DocSettingsLayer}, and merges
 * template + user layers over {@link DEFAULTS} into a fully-resolved
 * {@link DocSettings}.
 *
 * Source of truth for defaults and aliases: `docs/document-model.md`
 * (the curated subset; see DESIGN.md §8).
 */

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

/* ─────────────────────────── defaults ─────────────────────────── */

/** Every field at its documented default (docs/document-model.md). */
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

  // layout behavior
  limitImageToPage: true,
  keepImageTogether: true,
  repeatTableHeader: true,
  avoidTableRowBreaks: true,

  // theme — the default look (font + accent + element style) when a document
  // doesn't pick one. Templates set layout only, never a theme.
  theme: 'light-academic-1',
};

/* ─────────────────────────── parsing ─────────────────────────── */

/**
 * Locate the first `{{nyml ... }}` block whose body declares `kind: document`,
 * parse its `key: value` lines (including `key: |` multiline blocks) into a
 * {@link RawDocSettings}, and return the source with that block removed so it
 * is not rendered as content. No document block → `{ raw: {}, body: source }`.
 */
export function parseDocSettings(source: string): {
  raw: RawDocSettings;
  body: string;
} {
  let searchFrom = 0;

  while (searchFrom < source.length) {
    const open = source.indexOf('{{nyml', searchFrom);
    if (open === -1) break;

    // Find the matching closing `}}` for this block, allowing `}` inside the
    // body as long as it is not the `}}` terminator.
    const close = findClosing(source, open + '{{nyml'.length);
    if (close === -1) break;

    const inner = source.slice(open + '{{nyml'.length, close);
    if (isDocumentBlock(inner)) {
      const raw = parseNymlBody(inner);
      const body = stripLeadingBlank(source, open, close);
      return { raw, body };
    }

    searchFrom = close + 2;
  }

  return { raw: {}, body: source };
}

/** Find the index of the `}}` that closes a `{{nyml` opened at/after `from`. */
function findClosing(source: string, from: number): number {
  for (let i = from; i < source.length - 1; i++) {
    if (source[i] === '}' && source[i + 1] === '}') return i;
  }
  return -1;
}

/** Remove the block `[open, close+2)` and collapse a resulting blank gap. */
function stripLeadingBlank(
  source: string,
  open: number,
  close: number,
): string {
  const before = source.slice(0, open);
  let after = source.slice(close + 2);

  // If the block sat on its own line(s), drop one trailing newline pair so we
  // don't leave a large blank hole where it was.
  if (/\n[ \t]*$/.test(before) || before === '') {
    after = after.replace(/^[ \t]*\n/, '');
  }
  return before + after;
}

/** True if the nyml body contains a `kind: document` declaration. */
function isDocumentBlock(inner: string): boolean {
  return /(^|\n)\s*kind\s*:\s*document\s*(\n|$)/.test(inner);
}

/**
 * Parse a nyml body into a flat `key: value` map. Supports `key: |` multiline
 * blocks: subsequent lines indented more than the key are joined (newline
 * separated) as that key's value. The `kind:` line itself is skipped.
 */
function parseNymlBody(inner: string): RawDocSettings {
  const raw: RawDocSettings = {};
  const lines = inner.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = /^(\s*)([A-Za-z0-9_]+)\s*:\s?(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }

    const indent = m[1].length;
    const key = m[2];
    let value = m[3];

    if (key === 'kind') {
      i++;
      continue;
    }

    if (value.trim() === '|') {
      // Multiline block: gather following lines indented more than this key.
      // Dedent by the indentation of the first content line (block style).
      const collected: string[] = [];
      let blockIndent = -1;
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === '') {
          collected.push('');
          i++;
          continue;
        }
        const nextIndent = next.match(/^[ \t]*/)?.[0].length ?? 0;
        if (nextIndent <= indent) break;
        if (blockIndent === -1) blockIndent = nextIndent;
        collected.push(next.slice(Math.min(blockIndent, nextIndent)));
        i++;
      }
      // Drop trailing blank lines from the collected block.
      while (collected.length && collected[collected.length - 1] === '') {
        collected.pop();
      }
      raw[key] = collected.join('\n');
      continue;
    }

    raw[key] = stripQuotes(value.trim());
    i++;
  }

  return raw;
}

/** Strip a single pair of matching surrounding quotes, if present. */
function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
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
 * unknown keys are ignored.
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
