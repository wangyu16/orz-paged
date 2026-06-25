/**
 * Page CSS — M5.
 *
 * Turns a fully-resolved {@link DocSettings} into the `@page` rules, margin-box
 * running headers/footers, page-number counters, `:root` design tokens, and
 * layout-behavior CSS that paged.js realizes into physical page boxes.
 *
 * Behavior SPEC: `docs/document-model.md`; token set + page model:
 * `docs/dom-contract.md`. Reimplemented cleanly in TS (light-only output).
 */

import type {
  DocSettings,
  PageNumberPosition,
  PageNumberStyle,
} from '../types.js';
import { fontPreset } from './fonts.js';

/* ─────────────────────────── helpers ─────────────────────────── */

/** Escape a user string for safe use inside a CSS `content: "..."` value. */
function cssString(raw: string): string {
  return '"' + raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** Named page sizes pass straight through; a custom string passes through too. */
function pageSizeValue(size: string): string {
  return size.trim();
}

/** The margin-box at-rule name for a page-number / header / footer position. */
function marginBoxName(pos: PageNumberPosition): string | null {
  switch (pos) {
    case 'header-left':
      return '@top-left';
    case 'header-center':
      return '@top-center';
    case 'header-right':
      return '@top-right';
    case 'footer-left':
      return '@bottom-left';
    case 'footer-center':
      return '@bottom-center';
    case 'footer-right':
      return '@bottom-right';
    default:
      return null;
  }
}

/** The `content` expression for a page-number style. */
function pageNumberExpr(style: PageNumberStyle): string {
  switch (style) {
    case 'simple':
      return 'counter(page)';
    case 'page-n':
      return '"Page " counter(page)';
    case 'page-n-of-N':
      return '"Page " counter(page) " of " counter(pages)';
    case 'n-of-N':
      return 'counter(page) " of " counter(pages)';
    case 'n-slash-N':
      return 'counter(page) " / " counter(pages)';
    case 'dash-n-dash':
      return '"— " counter(page) " —"';
    case 'brackets':
      return '"[" counter(page) "]"';
    case 'parentheses':
      return '"(" counter(page) ")"';
    default:
      return 'counter(page)';
  }
}

/* ─────────────────────────── builder ─────────────────────────── */

/**
 * Build the full page CSS string for a document. Pure: depends only on `s`.
 */
export function buildPageCss(s: DocSettings): string {
  const body = fontPreset(s.fontPreset);
  const family = s.fontFamily ?? body.family;
  const headingFamily = s.fontHeadingPreset
    ? fontPreset(s.fontHeadingPreset).family
    : family;
  const marginBoxFamily = s.fontMarginBoxPreset
    ? fontPreset(s.fontMarginBoxPreset).family
    : family;

  const headerRuleColor = s.headerRuleColor || s.decorationColor;
  const footerRuleColor = s.footerRuleColor || s.decorationColor;

  // Collect the margin-box declarations for the @page rule. Each value is the
  // inner CSS (content + any per-box styling) keyed by margin-box at-rule.
  const boxes = new Map<string, string[]>();
  const addBox = (name: string, decl: string) => {
    const list = boxes.get(name);
    if (list) list.push(decl);
    else boxes.set(name, [decl]);
  };

  // Static running headers/footers.
  const headerFs = `font-size: ${s.headerFontSize}pt;`;
  const footerFs = `font-size: ${s.footerFontSize}pt;`;
  const addStatic = (
    name: string,
    text: string,
    fontSize: string,
  ) => {
    if (text && text.length > 0) {
      addBox(name, `content: ${cssString(text)}; ${fontSize}`);
    }
  };
  addStatic('@top-left', s.headerLeft, headerFs);
  addStatic('@top-center', s.headerCenter, headerFs);
  addStatic('@top-right', s.headerRight, headerFs);
  addStatic('@bottom-left', s.footerLeft, footerFs);
  addStatic('@bottom-center', s.footerCenter, footerFs);
  addStatic('@bottom-right', s.footerRight, footerFs);

  // Page number → its margin box. A page number wins the `content` of its box
  // (so it isn't double-declared with a static header/footer in the same box).
  const pnBox = marginBoxName(s.pageNumberPosition);
  if (pnBox && s.pageNumberPosition !== 'none') {
    const expr = pageNumberExpr(s.pageNumberStyle);
    const isHeader = s.pageNumberPosition.startsWith('header-');
    const fontSize = isHeader ? headerFs : footerFs;
    boxes.set(pnBox, [`content: ${expr}; ${fontSize}`]);
  }

  // Header/footer rule lines: drawn via a margin-box border. A rule applies to
  // the whole edge, so attach it to the center box (always realized by paged.js).
  if (s.headerRule) {
    const name = '@top-center';
    const list = boxes.get(name) ?? [];
    list.push(`border-bottom: 0.5pt solid ${headerRuleColor};`);
    boxes.set(name, list);
  }
  if (s.footerRule) {
    const name = '@bottom-center';
    const list = boxes.get(name) ?? [];
    list.push(`border-top: 0.5pt solid ${footerRuleColor};`);
    boxes.set(name, list);
  }

  // Assemble @page margin-box rules.
  const marginBoxRules: string[] = [];
  for (const [name, decls] of boxes) {
    marginBoxRules.push(`  ${name} {\n    ${decls.join('\n    ')}\n  }`);
  }

  const margin = `${s.marginTop}mm ${s.marginRight}mm ${s.marginBottom}mm ${s.marginLeft}mm`;

  const pageRule =
    `@page {\n` +
    `  size: ${pageSizeValue(s.pageSize)};\n` +
    `  margin: ${margin};\n` +
    (marginBoxRules.length ? marginBoxRules.join('\n') + '\n' : '') +
    `}`;

  // First-page header/footer suppression.
  const firstPageDecls: string[] = [];
  if (s.firstPageHideHeader) {
    firstPageDecls.push(
      '  @top-left { content: none }',
      '  @top-center { content: none }',
      '  @top-right { content: none }',
    );
  }
  if (s.firstPageHideFooter || s.firstPageSkipNumber) {
    firstPageDecls.push(
      '  @bottom-left { content: none }',
      '  @bottom-center { content: none }',
      '  @bottom-right { content: none }',
    );
  }
  const firstPageRule = firstPageDecls.length
    ? `@page:first {\n${firstPageDecls.join('\n')}\n}`
    : '';

  // :root design tokens (dom-contract).
  const rootVars: string[] = [
    `  --page-size: ${pageSizeValue(s.pageSize)};`,
    `  --margin-t: ${s.marginTop}mm;`,
    `  --margin-b: ${s.marginBottom}mm;`,
    `  --margin-l: ${s.marginLeft}mm;`,
    `  --margin-r: ${s.marginRight}mm;`,
    `  --font-body: ${family};`,
    `  --font-heading: ${headingFamily};`,
    `  --font-margin-box: ${marginBoxFamily};`,
    `  --font-size: ${s.fontSize}pt;`,
    `  --line-height: ${s.lineHeight};`,
    `  --accent: ${s.decorationColor};`,
    `  --page-bg: ${s.pageBackground || '#ffffff'};`,
    `  --header-rule: ${headerRuleColor};`,
    `  --footer-rule: ${footerRuleColor};`,
  ];
  const rootRule = `:root {\n${rootVars.join('\n')}\n}`;

  // Body / element base styling that consumes the tokens.
  const baseRule =
    `.orz-doc {\n` +
    `  font-family: var(--font-body);\n` +
    `  font-size: var(--font-size);\n` +
    `  line-height: var(--line-height);\n` +
    `}\n` +
    `.pagedjs_margin-top, .pagedjs_margin-bottom,\n` +
    `.pagedjs_margin-top-left, .pagedjs_margin-top-center, .pagedjs_margin-top-right,\n` +
    `.pagedjs_margin-bottom-left, .pagedjs_margin-bottom-center, .pagedjs_margin-bottom-right {\n` +
    `  font-family: var(--font-margin-box);\n` +
    `}`;

  // Layout-behavior CSS.
  const layout: string[] = [];
  if (s.limitImageToPage) {
    layout.push('img { max-width: 100%; max-height: 100%; }');
  }
  if (s.keepImageTogether) {
    layout.push('img, figure { break-inside: avoid; }');
  }
  if (s.repeatTableHeader) {
    layout.push('thead { display: table-header-group; }');
  }
  if (s.avoidTableRowBreaks) {
    layout.push('tr { break-inside: avoid; }');
  }
  const layoutRule = layout.join('\n');

  return [
    pageRule,
    firstPageRule,
    rootRule,
    baseRule,
    layoutRule,
    s.customCss ?? '',
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');
}
