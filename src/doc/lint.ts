/**
 * The paged header's enumerated values (claim S.6): a value the renderer
 * would not recognise — and silently replace by its default or pass through
 * as broken CSS — is a lint warning `invalid-value` naming the key, the value
 * and the values it takes. Added to the kit's header lint by this carrier's
 * `readDocument` (Node and browser), so `inspect`, `assemble` and the editor
 * report it. Isomorphic, pure.
 *
 * Keys checked: `page_size` (a named size, any case, optionally followed by
 * `portrait` / `landscape`, or a CSS size of one or two lengths),
 * `page_number_position`, `page_number_style`, `template` (an id or a legacy
 * alias), the three font presets, and the booleans `front_matter` /
 * `front_matter_clean` (`clean`, `plain`, `normal` or a boolean word).
 */
import { readHeader, type Lint } from 'orz-markdown/carrier';
import { FONT_PRESETS } from './fonts.js';
import { canonicalTemplate, templateList } from './templates.js';

export const PAGE_SIZE_NAMES: readonly string[] = Object.freeze(['A4', 'Letter', 'A5', 'Legal', 'A3']);
export const PAGE_NUMBER_POSITION_VALUES: readonly string[] = Object.freeze(['footer-center', 'footer-right', 'footer-left', 'header-center', 'header-right', 'header-left', 'none']);
export const PAGE_NUMBER_STYLE_VALUES: readonly string[] = Object.freeze(['simple', 'page-n', 'page-n-of-N', 'n-of-N', 'n-slash-N', 'dash-n-dash', 'brackets', 'parentheses']);

const LENGTH = String.raw`\d+(?:\.\d+)?(?:mm|cm|in|pt|pc|px|Q)`;
const CSS_SIZE = new RegExp(String.raw`^${LENGTH}(?:\s+${LENGTH})?$`);
const NAMED_SIZE = new RegExp(String.raw`^(?:${PAGE_SIZE_NAMES.join('|')})(?:\s+(?:portrait|landscape))?$`, 'i');
/** What `front_matter` / `front_matter_clean` take (src/doc/settings.ts): `clean` / `plain` / a true word → clean, `normal` / a false word → not. */
const BOOL_WORDS = ['clean', 'plain', 'normal', 'true', 'false', 'yes', 'no', 'on', 'off', '1', '0'];

const list = (vs: readonly string[]): string => vs.join(', ');

/** The `invalid-value` warnings of a text's header (none without a header). */
export function pagedValueLint(text: string): Lint[] {
  const h = readHeader(text);
  if (!h) return [];
  const out: Lint[] = [];
  const presets = Object.keys(FONT_PRESETS);
  const check: Record<string, { ok(v: string): boolean; takes: string }> = {
    page_size: { ok: (v) => NAMED_SIZE.test(v) || CSS_SIZE.test(v), takes: `${list(PAGE_SIZE_NAMES)} (optionally "landscape"), or a CSS size such as "6in 9in"` },
    page_number_position: { ok: (v) => PAGE_NUMBER_POSITION_VALUES.includes(v), takes: list(PAGE_NUMBER_POSITION_VALUES) },
    page_number_style: { ok: (v) => PAGE_NUMBER_STYLE_VALUES.includes(v), takes: list(PAGE_NUMBER_STYLE_VALUES) },
    template: { ok: (v) => !(v in Object.prototype) && canonicalTemplate(v) !== undefined, takes: list(templateList().map((t) => t.id)) },
    font_preset: { ok: (v) => presets.includes(v), takes: list(presets) },
    font_heading_preset: { ok: (v) => presets.includes(v), takes: list(presets) },
    font_margin_box_preset: { ok: (v) => presets.includes(v), takes: list(presets) },
    front_matter: { ok: (v) => BOOL_WORDS.includes(v.toLowerCase()), takes: list(BOOL_WORDS) },
    front_matter_clean: { ok: (v) => BOOL_WORDS.includes(v.toLowerCase()), takes: list(BOOL_WORDS) },
  };
  for (const e of h.entries) {
    const c = Object.prototype.hasOwnProperty.call(check, e.key) ? check[e.key] : undefined;
    if (!c) continue;
    const v = (h.fields[e.key] ?? '').trim();
    if (v === '' || c.ok(v)) continue;
    out.push({ level: 'warning', code: 'invalid-value', key: e.key, line: e.line, from: e.valueFrom, to: e.to, message: `${e.key}: ${JSON.stringify(v)} is not a value it takes (${c.takes}); the default is used` });
  }
  return out;
}
