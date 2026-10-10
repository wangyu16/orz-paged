/**
 * Derives orz-paged's print themes from orz-markdown's light themes.
 *
 *   npx tsx scripts/build-themes.ts           write the generated files
 *   npx tsx scripts/build-themes.ts --check   exit 1 when a generated file is stale
 *
 * Inputs (the installed orz-markdown package, so a theme change there flows
 * into paged on rebuild):
 *   node_modules/orz-markdown/themes/common.css   the structure layer
 *   node_modules/orz-markdown/themes/<id>.css     the 9 light themes (decoration)
 * plus this repository's hand-written layers:
 *   assets/themes/layers/structure.css   paged structure (pages, elements, TOC)
 *   assets/themes/layers/<id>.css        the per-theme print layer
 *
 * Outputs (generated, committed; run by `prebuild` / `pretest`):
 *   assets/themes/base.css        common.css adapted for pages + structure.css
 *   assets/themes/<id>.css        one print theme per light source theme
 *   src/doc/theme-fonts.ts        each theme's webfont stylesheets and families
 *
 * The rules of the derivation (what is kept, what is dropped, and why) are in
 * assets/themes/README.md; tests/themes.test.ts checks the output.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'node_modules/orz-markdown/themes');
const OUT_DIR = join(ROOT, 'assets/themes');
const LAYER_DIR = join(OUT_DIR, 'layers');
const FONTS_TS = join(ROOT, 'src/doc/theme-fonts.ts');

/* ───────────────────────────── theme specs ───────────────────────────── */

/**
 * How a source theme names the things paged settings control. The derived
 * theme re-points these variables at the paged tokens, so `page_background`,
 * `decoration_color` and the font presets restyle the theme the way its own
 * author wired them (knock-outs follow the paper, rules follow the accent).
 */
export interface ThemeSpec {
  /** Variables that hold the paper colour; the first one's value is the theme's paper. */
  paper: readonly string[];
  /** The variable that is the theme's accent (links, marks, rules). */
  accent: string;
  /** Body text, heading and muted text colours. */
  text: string;
  heading: string;
  muted: string;
  /** The variables the theme sets its fonts with. */
  fonts: { body: string; heading: string; code: string };
}

/** The 9 light themes, in orz-markdown's picker order (THEMES from orz-markdown/themes). */
export const SPECS: Readonly<Record<string, ThemeSpec>> = {
  'light-neat-3': { paper: ['--bg', '--bg-soft'], accent: '--accent', text: '--text', heading: '--heading', muted: '--text-muted', fonts: { body: '--font-body', heading: '--font-heading', code: '--font-code' } },
  'light-neat-1': { paper: ['--bg-soft', '--bg'], accent: '--accent', text: '--text', heading: '--heading', muted: '--text-muted', fonts: { body: '--font-body', heading: '--font-heading', code: '--font-code' } },
  'light-neat-2': { paper: ['--bg-soft', '--bg'], accent: '--accent', text: '--text', heading: '--heading', muted: '--text-muted', fonts: { body: '--font-body', heading: '--font-heading', code: '--font-code' } },
  'light-academic-1': { paper: ['--bg-color'], accent: '--rubric', text: '--text-main', heading: '--heading', muted: '--text-muted', fonts: { body: '--main-font', heading: '--main-font', code: '--code-font' } },
  'light-academic-2': { paper: ['--bg-color'], accent: '--link-color', text: '--text-main', heading: '--heading', muted: '--text-muted', fonts: { body: '--main-font', heading: '--header-font', code: '--code-font' } },
  'beige-decent-1': { paper: ['--bg-color'], accent: '--link-color', text: '--text-main', heading: '--heading', muted: '--text-muted', fonts: { body: '--main-font', heading: '--display-font', code: '--code-font' } },
  'beige-decent-2': { paper: ['--bg-color'], accent: '--link-color', text: '--text-main', heading: '--heading', muted: '--text-muted', fonts: { body: '--main-font', heading: '--header-font', code: '--code-font' } },
  'light-playful-1': { paper: ['--bg-color'], accent: '--accent', text: '--text-main', heading: '--text-strong', muted: '--text-muted', fonts: { body: '--body-font', heading: '--heading-font', code: '--code-font' } },
  'light-playful-2': { paper: ['--paper', '--bg-color'], accent: '--link-color', text: '--text-main', heading: '--text-main', muted: '--text-muted', fonts: { body: '--body-font', heading: '--heading-font', code: '--code-font' } },
};

/* ───────────────────────────── a small CSS reader ───────────────────────────── */

/** Index just past the string literal that starts at `i`. */
function endOfString(s: string, i: number): number {
  const q = s[i];
  let j = i + 1;
  while (j < s.length && s[j] !== q) {
    if (s[j] === '\\') j++;
    j++;
  }
  return j + 1;
}

/** The CSS without comments (strings kept intact). */
export function stripComments(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const j = endOfString(css, i);
      out += css.slice(i, j);
      i = j;
    } else if (c === '/' && css[i + 1] === '*') {
      const j = css.indexOf('*/', i + 2);
      i = j < 0 ? css.length : j + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Split `s` on `sep` at nesting depth 0 (outside strings, (), [] and {}). */
export function splitTop(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      i = endOfString(s, i) - 1;
    } else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === sep && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

export type CssNode =
  | { kind: 'rule'; selector: string; body: string }
  | { kind: 'at'; name: string; prelude: string; body: string | null };

/** Top-level statements of a (comment-free) stylesheet or block body. */
export function parseNodes(css: string): CssNode[] {
  const nodes: CssNode[] = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;
    let depth = 0;
    let j = i;
    for (; j < css.length; j++) {
      const c = css[j];
      if (c === '"' || c === "'") j = endOfString(css, j) - 1;
      else if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth === 0 && (c === '{' || c === ';')) break;
    }
    const prelude = css.slice(i, j).trim();
    if (j >= css.length || css[j] === ';') {
      const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude);
      if (m) nodes.push({ kind: 'at', name: m[1].toLowerCase(), prelude: m[2].trim(), body: null });
      i = j + 1;
      continue;
    }
    let level = 1;
    let k = j + 1;
    for (; k < css.length && level > 0; k++) {
      const c = css[k];
      if (c === '"' || c === "'") k = endOfString(css, k) - 1;
      else if (c === '{') level++;
      else if (c === '}') level--;
    }
    const body = css.slice(j + 1, k - 1);
    const m = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude);
    if (m) nodes.push({ kind: 'at', name: m[1].toLowerCase(), prelude: m[2].trim(), body });
    else nodes.push({ kind: 'rule', selector: prelude, body });
    i = k;
  }
  return nodes;
}

export interface Decl {
  prop: string;
  value: string;
  important: boolean;
}

export function parseDecls(body: string): Decl[] {
  return splitTop(body, ';').flatMap((d) => {
    const colon = d.indexOf(':');
    if (colon < 0) return [];
    const prop = d.slice(0, colon).trim();
    let value = d.slice(colon + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
    return [{ prop: prop.startsWith('--') ? prop : prop.toLowerCase(), value, important }];
  });
}

const formatDecls = (decls: Decl[], indent = '  '): string =>
  decls.map((d) => `${indent}${d.prop}: ${d.value}${d.important ? ' !important' : ''};`).join('\n');

/* ───────────────────────────── the derivation ───────────────────────────── */

/** Selectors that only mean something on a screen: pointer and focus states, selection, scrollbars. */
const INTERACTIVE = /:(hover|focus|focus-visible|focus-within|active|visited)\b|::selection|::-webkit-scrollbar/;
/** Optional on-screen modifier classes of the neat themes (paged has font presets instead). */
const MODIFIER = /\.(font-(serif|sans|handwritten|typewrite)|size-(xs|sm|lg|xl))\b/;
/** The article itself (its frame, padding and measure belong to the page now). */
const ARTICLE = /^(:where\()?\.markdown-body\)?$/;
const ARTICLE_PSEUDO = /^(:where\()?\.markdown-body\)?::?(before|after)$/;

/** Properties that do nothing on paper. */
const SCREEN_ONLY_PROPS = /^(-webkit-)?(transition|animation)(-[\w-]+)?$|^cursor$|^scroll-(behavior|margin|padding)(-[\w-]+)?$|^scrollbar-[\w-]+$|^(-webkit-)?user-select$|^will-change$|^(-webkit-)?backdrop-filter$/;

/** What the article root may keep: text rendering, not geometry or paint. */
const ARTICLE_KEEP = /^(color|font-variant[\w-]*|font-feature-settings|font-variation-settings|font-kerning|-webkit-font-smoothing|text-rendering|hyphens|overflow-wrap|word-break|letter-spacing|word-spacing|isolation|position|text-align|display)$/;

/** Variables that size the article on a screen (its measure, padding and frame). */
const SCREEN_VARS = /^--(markdown-body-[\w-]+|orz-measure-wide|transition)$/;

/**
 * Paged.js splits some selectors on every comma (rules with `display`,
 * `break-*`, `page`, `+`, `*-of-type`) and then queries the pieces, so a comma
 * inside `:is()` / `:where()` / `:has()` / `:not()` breaks pagination. Expand
 * them: `a :is(b, c)` → `a :is(b)`, `a :is(c)`; `:not(b, c)` → `:not(b):not(c)`.
 * `:where()` stays zero-specificity, the others keep their meaning.
 */
export function expandSelector(sel: string): string[] {
  const re = /:(is|where|has|not)\(/g;
  for (let m = re.exec(sel); m; m = re.exec(sel)) {
    const open = m.index + m[0].length;
    let depth = 0;
    let close = open;
    for (; close < sel.length; close++) {
      const c = sel[close];
      if (c === '"' || c === "'") close = endOfString(sel, close) - 1;
      else if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') {
        if (depth === 0) break;
        depth--;
      }
    }
    const args = splitTop(sel.slice(open, close), ',');
    if (args.length < 2) continue;
    const before = sel.slice(0, m.index);
    const after = sel.slice(close + 1);
    if (m[1] === 'not') return expandSelector(before + args.map((a) => `:not(${a})`).join('') + after);
    return args.flatMap((a) => expandSelector(`${before}:${m![1]}(${a})${after}`));
  }
  return [sel];
}

/** Re-emit a stylesheet with every selector list expanded (see {@link expandSelector}). */
export function expandStylesheet(css: string): string {
  const emit = (nodes: CssNode[]): string[] =>
    nodes.map((n) => {
      if (n.kind === 'rule') return `${splitTop(n.selector, ',').flatMap(expandSelector).join(',\n')} {\n${formatDecls(parseDecls(n.body))}\n}`;
      if (n.body === null) return `@${n.name} ${n.prelude};`;
      const inner = /^(media|supports|layer|container)$/.test(n.name) ? emit(parseNodes(n.body)).join('\n\n') : formatDecls(parseDecls(n.body));
      return `@${n.name}${n.prelude ? ' ' + n.prelude : ''} {\n${inner}\n}`;
    });
  return emit(parseNodes(stripComments(css))).join('\n\n');
}

/** Drop the soft (blurred) layers of a shadow; keep hard offset or ring layers, which print as lines. */
export function printShadow(value: string): string {
  if (/^none$/i.test(value.trim()) || /^var\(/.test(value.trim())) return value;
  const kept = splitTop(value, ',').filter((layer) => {
    const lengths = splitTop(layer.replace(/\s+/g, ' '), ' ').filter((t) => /^-?(\d*\.)?\d+([a-z]+)?$/i.test(t));
    return lengths.length < 3 || parseFloat(lengths[2]) === 0;
  });
  return kept.length ? kept.join(', ') : 'none';
}

/** Replace viewport-relative clamps by their upper bound (the desktop design value). */
export function withoutViewport(value: string): string {
  let out = value;
  for (let guard = 0; guard < 20 && /v(w|h|min|max)\b/.test(out); guard++) {
    const m = /clamp\(/.exec(out);
    if (!m) break;
    let depth = 0;
    let end = m.index + 6;
    for (; end < out.length; end++) {
      if (out[end] === '(') depth++;
      else if (out[end] === ')') {
        if (depth === 0) break;
        depth--;
      }
    }
    const args = splitTop(out.slice(m.index + 6, end), ',');
    const replacement = args.length === 3 && /v(w|h|min|max)\b/.test(args[1]) ? args[2] : `__CLAMP__(${args.join(', ')})`;
    out = out.slice(0, m.index) + replacement + out.slice(end + 1);
  }
  return out.replace(/__CLAMP__\(/g, 'clamp(');
}

/** A font size in px/rem → em of the theme's body size, so the page's font size scales the whole theme. */
export function relativeFontSize(value: string, basePx: number): string {
  return value.replace(/(-?(?:\d*\.)?\d+)(px|rem)\b/g, (_, n: string, unit: string) => {
    const px = parseFloat(n) * (unit === 'rem' ? 16 : 1);
    return `${+(px / basePx).toFixed(4)}em`;
  });
}

interface Context {
  /** `drop` a theme's own @media print (screen ink-saving); `unwrap` common.css's (paged is print). */
  print: 'drop' | 'unwrap';
  /** Whether the article root is trimmed to text rendering (themes) or kept (common.css). */
  trimArticle: boolean;
  basePx: number;
  fonts: string[];
  /** Extra declarations appended to the first :root rule. */
  rootExtra?: (decls: Decl[]) => Decl[];
  rootDone?: boolean;
}

function transformDecl(d: Decl, ctx: Context, inRoot: boolean): Decl | null {
  if (SCREEN_ONLY_PROPS.test(d.prop)) return null;
  if (d.prop === 'position' && /^(fixed|sticky)$/i.test(d.value)) return null;
  if (inRoot && SCREEN_VARS.test(d.prop)) return null;
  let value = withoutViewport(d.value);
  if (d.prop === 'box-shadow' || (d.prop.startsWith('--') && /shadow/.test(d.prop))) value = printShadow(value);
  if (d.prop === 'font-size' && !inRoot) value = relativeFontSize(value, ctx.basePx);
  if (inRoot && d.prop === '--base-size') value = '1em';
  return { ...d, value };
}

function transformRule(selector: string, body: string, ctx: Context): string {
  const selectors = splitTop(selector, ',').filter((s) => {
    if (INTERACTIVE.test(s) || MODIFIER.test(s)) return false;
    if (s === ':root') return true;
    if (ARTICLE_PSEUDO.test(s) && ctx.trimArticle) return false;
    return s.includes('markdown-body');
  });
  if (!selectors.length) return '';
  const inRoot = selectors.length === 1 && selectors[0] === ':root';
  const article = ctx.trimArticle && selectors.every((s) => ARTICLE.test(s));
  let decls = parseDecls(body)
    .map((d) => transformDecl(d, ctx, inRoot))
    .filter((d): d is Decl => d !== null)
    .filter((d) => !article || ARTICLE_KEEP.test(d.prop) || d.prop.startsWith('--'));
  if (inRoot && ctx.rootExtra && !ctx.rootDone) {
    decls = ctx.rootExtra(decls);
    ctx.rootDone = true;
  }
  if (!decls.length) return '';
  return `${selectors.flatMap(expandSelector).join(',\n')} {\n${formatDecls(decls)}\n}`;
}

function transformNodes(nodes: CssNode[], ctx: Context): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.kind === 'rule') {
      const r = transformRule(n.selector, n.body, ctx);
      if (r) out.push(r);
      continue;
    }
    if (n.name === 'import') {
      const url = /url\(\s*['"]?([^'")]+)['"]?\s*\)|^['"]([^'"]+)['"]/.exec(n.prelude);
      const href = url?.[1] ?? url?.[2] ?? '';
      if (/^https?:/.test(href)) ctx.fonts.push(href);
      continue; // ./common.css → base.css; fonts → <link> (theme-fonts.ts)
    }
    if (n.name === 'media' && n.body !== null) {
      if (/^print$/i.test(n.prelude) && ctx.print === 'unwrap') out.push(...transformNodes(parseNodes(n.body), ctx));
      continue; // viewport queries never apply to a page; a theme's print block is screen ink-saving
    }
    if (n.name === 'supports' && n.body !== null) {
      const inner = transformNodes(parseNodes(n.body), ctx);
      if (inner.length) out.push(`@supports ${n.prelude} {\n${inner.join('\n\n')}\n}`);
      continue;
    }
    if (n.name === 'keyframes' || n.name === '-webkit-keyframes') continue;
    if (n.name === 'font-face' && n.body !== null) out.push(`@font-face {\n${formatDecls(parseDecls(n.body))}\n}`);
  }
  return out;
}

/** The value a :root variable has in the source theme. */
function rootValue(decls: Decl[], name: string): string | undefined {
  return decls.find((d) => d.prop === name)?.value;
}

/** The source theme's body size in px (its --base-size), the unit its px/rem font sizes are relative to. */
function basePxOf(css: string): number {
  const m = /--base-size:\s*([\d.]+)(px|rem)/.exec(css);
  if (!m) return 16;
  return parseFloat(m[1]) * (m[2] === 'rem' ? 16 : 1);
}

/** Re-point the source's own variables at the paged tokens (paper, accent, fonts) and alias the element tokens. */
function rootMapping(id: string, spec: ThemeSpec): (decls: Decl[]) => Decl[] {
  return (decls) => {
    const need = (name: string): string => {
      const v = rootValue(decls, name);
      if (v === undefined) throw new Error(`${id}: :root has no ${name}`);
      return v;
    };
    const paper = need(spec.paper[0]);
    const tokens: Array<[string, string, string[]]> = [
      ['--page-bg', paper, spec.paper as string[]],
      ['--accent', need(spec.accent), [spec.accent]],
      ['--font-body', need(spec.fonts.body), [spec.fonts.body]],
      ['--font-heading', need(spec.fonts.heading), [spec.fonts.heading]],
      ['--font-code', need(spec.fonts.code), [spec.fonts.code]],
    ];
    const repointed = new Set<string>();
    const out = decls.map((d) => {
      for (const [token, , vars] of tokens) {
        if (vars.includes(d.prop) && d.prop !== token) {
          repointed.add(d.prop);
          return { ...d, value: `var(${token})` };
        }
      }
      return d;
    });
    const added: Decl[] = [];
    for (const [token, value] of tokens) {
      const i = out.findIndex((d) => d.prop === token);
      if (i >= 0) out.splice(i, 1);
      added.push({ prop: token, value, important: false });
    }
    // The element tokens paged's own elements (title blocks, TOC, letterhead…) read.
    if (spec.text !== '--text-main') added.push({ prop: '--text-main', value: `var(${spec.text})`, important: false });
    if (spec.muted !== '--text-muted') added.push({ prop: '--text-muted', value: `var(${spec.muted})`, important: false });
    added.push({ prop: '--heading-color', value: `var(${spec.heading})`, important: false });
    // The page furniture (running headers/footers, page numbers; src/doc/page-css.ts) takes the
    // theme: its body font and its muted text colour.
    added.push({ prop: '--orz-furniture-font', value: 'var(--font-body)', important: false });
    added.push({ prop: '--orz-furniture-color', value: `var(${spec.muted})`, important: false });
    return [...out, ...added];
  };
}

function header(title: string, lines: string[]): string {
  return ['/* ' + '='.repeat(74), `   ${title}`, ...lines.map((l) => (l ? `   ${l}` : '')), '   ' + '='.repeat(74) + ' */'].join('\n');
}

const sourceVersion = (): string => JSON.parse(readFileSync(join(SOURCE_DIR, '../package.json'), 'utf8')).version as string;

export interface DerivedTheme {
  id: string;
  css: string;
  fonts: string[];
  families: { body: string; heading: string; code: string };
}

/** Derive one paged print theme from an orz-markdown theme's CSS. */
export function deriveTheme(id: string, sourceCss: string, layerCss: string, version = sourceVersion()): DerivedTheme {
  const spec = SPECS[id];
  if (!spec) throw new Error(`no theme spec for ${id}`);
  const clean = stripComments(sourceCss);
  const ctx: Context = { print: 'drop', trimArticle: true, basePx: basePxOf(clean), fonts: [], rootExtra: rootMapping(id, spec) };
  const body = transformNodes(parseNodes(clean), ctx);
  if (!ctx.rootDone) throw new Error(`${id}: no :root rule`);
  const rootDecls = parseNodes(clean).filter((n): n is Extract<CssNode, { kind: 'rule' }> => n.kind === 'rule' && n.selector === ':root').flatMap((n) => parseDecls(n.body));
  const fam = (name: string): string => rootValue(rootDecls, name) ?? '';
  const css = [
    header(`orz-paged · ${id}.css — GENERATED by scripts/build-themes.ts; do not edit.`, [
      `Derived from orz-markdown ${version} themes/${id}.css (decoration) for print`,
      `pages, then the print layer assets/themes/layers/${id}.css. Load after base.css.`,
      'Kept: typography, colours, rules, boxes, ornaments. Dropped: screen-only',
      'states, transitions, blurred shadows, viewport sizing, the article frame and',
      'the page backdrop (the page sheet is the paper: --page-bg). See README.md.',
    ]),
    ...body,
    layerCss.trim() ? `/* ---- print layer: assets/themes/layers/${id}.css ---- */\n\n${expandStylesheet(layerCss)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { id, css: css + '\n', fonts: ctx.fonts, families: { body: fam(spec.fonts.body), heading: fam(spec.fonts.heading), code: fam(spec.fonts.code) } };
}

/** base.css: orz-markdown's structure layer adapted for pages, then paged's own structure. */
export function deriveBase(commonCss: string, structureCss: string, version = sourceVersion()): string {
  const ctx: Context = { print: 'unwrap', trimArticle: false, basePx: 16, fonts: [] };
  const common = transformNodes(parseNodes(stripComments(commonCss)), ctx);
  return (
    [
      header('orz-paged · base.css — GENERATED by scripts/build-themes.ts; do not edit.', [
        `Part 1: orz-markdown ${version} themes/common.css (the structure layer every`,
        'theme shares), adapted for pages: its print rules always apply, viewport',
        'queries and the screen QR overlay are dropped. Part 2: assets/themes/layers/',
        'structure.css (the page sheet, page breaks, document elements, TOC). Theme',
        'files load after this one and carry decoration only.',
      ]),
      '/* ---- part 1: orz-markdown common.css ---- */',
      ...common,
      '/* ---- part 2: paged structure (assets/themes/layers/structure.css) ---- */',
      expandStylesheet(structureCss),
    ].join('\n\n') + '\n'
  );
}

function fontsModule(themes: DerivedTheme[]): string {
  const q = (s: string): string => JSON.stringify(s);
  const rows = themes.map((t) =>
    [
      `  ${q(t.id)}: {`,
      `    css: [${t.fonts.map(q).join(', ')}],`,
      `    body: ${q(t.families.body)},`,
      `    heading: ${q(t.families.heading)},`,
      `    code: ${q(t.families.code)},`,
      '  },',
    ].join('\n'),
  );
  return [
    '// Generated by scripts/build-themes.ts from orz-markdown\'s theme files — do not edit.',
    '/**',
    ' * Theme typography — each paged theme owns its fonts, exactly the webfonts its',
    ' * orz-markdown source theme imports (its `@import url(...)`, Google Fonts), so a',
    ' * paged document and the same text in orz-mdhtml set the same glyphs. The',
    ' * engine `<link>`s `css` for the active theme at view time (fonts load from the',
    ' * CDN; nothing is embedded) and waits for `document.fonts.ready` before',
    ' * paginating. `body` / `heading` / `code` are the CSS family stacks the theme',
    ' * sets as `--font-body` / `--font-heading` / `--font-code`; an explicit',
    ' * `font_preset` in the header still overrides them (page CSS loads last).',
    ' * `none` (plain) loads no webfont. Isomorphic: plain data.',
    ' */',
    "import type { ThemeName } from '../types.js';",
    '',
    'export interface ThemeFonts {',
    '  /** Webfont stylesheets to load (CDN URLs), in order. */',
    '  readonly css: readonly string[];',
    '  /** CSS font-family stacks of the body text, headings and code. */',
    '  readonly body: string;',
    '  readonly heading: string;',
    '  readonly code: string;',
    '}',
    '',
    'export const THEME_FONTS: Readonly<Record<ThemeName, ThemeFonts>> = {',
    '  none: {',
    '    css: [],',
    `    body: ${q('"Times New Roman", Times, Georgia, "Liberation Serif", serif')},`,
    `    heading: ${q('"Times New Roman", Times, Georgia, "Liberation Serif", serif')},`,
    `    code: ${q('ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace')},`,
    '  },',
    ...rows,
    '};',
    '',
  ].join('\n');
}

/** Every generated file, path → content. */
export function generate(): Map<string, string> {
  const files = new Map<string, string>();
  const version = sourceVersion();
  const read = (p: string): string => (existsSync(p) ? readFileSync(p, 'utf8') : '');
  const themes = Object.keys(SPECS).map((id) => deriveTheme(id, read(join(SOURCE_DIR, `${id}.css`)), read(join(LAYER_DIR, `${id}.css`)), version));
  for (const t of themes) files.set(join(OUT_DIR, `${t.id}.css`), t.css);
  files.set(join(OUT_DIR, 'base.css'), deriveBase(read(join(SOURCE_DIR, 'common.css')), read(join(LAYER_DIR, 'structure.css')), version));
  files.set(FONTS_TS, fontsModule(themes));
  return files;
}

function main(): void {
  const check = process.argv.includes('--check');
  const files = generate();
  const stale: string[] = [];
  for (const [path, content] of files) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === content) continue;
    stale.push(path.slice(ROOT.length + 1));
    if (!check) writeFileSync(path, content, 'utf8');
  }
  // a theme stylesheet with no source theme behind it is stale too
  for (const f of readdirSync(OUT_DIR)) {
    if (!f.endsWith('.css') || f === 'base.css' || SPECS[f.slice(0, -4)]) continue;
    stale.push(`assets/themes/${f}`);
    if (!check) unlinkSync(join(OUT_DIR, f));
  }
  if (check && stale.length) {
    console.error(`stale theme files (run: npx tsx scripts/build-themes.ts):\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  if (!check && stale.length) console.log(`themes: wrote ${stale.join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
