/**
 * Document renderer.
 *
 * `renderDocument(text)` turns a paged text (FC-18 text format 1) into a
 * {@link PagedAssembly}: pure data (CSS, font URLs, theme, body HTML, resolved
 * settings) that the browser engine then hands to paged.js for pagination. No
 * DOM here. (Named `assemble` before rebuild step 2; `assemble` now means the
 * FC-18 file assembler, src/assemble.ts.)
 *
 * Pipeline (archive/DESIGN.md §3/§6):
 *   1. The FC-18 header is the settings source (`readSettings`: the kit's
 *      `readHeader`); the body is the text after it (`withoutHeader`).
 *   2. Merge DEFAULTS ← template layer ← header → resolved settings.
 *   3. Scan the remaining body for concrete element-kind blocks, render each
 *      via `renderElement`, and replace it with a placeholder token.
 *   4. Render the placeholdered body Markdown, then swap each placeholder for
 *      its element's HTML (so element HTML is never re-parsed as Markdown).
 *   5. Compose page CSS + deduped element CSS + custom CSS; collect font URLs.
 */

import { md } from 'orz-markdown';
import { withoutHeader, type TwinNaming } from 'orz-markdown/carrier';
import { renderMarkdownPreviewWithIncludes } from 'orz-markdown/carrier/editor';

import type {
  DocSettings,
  PagedAssembly,
  ElementSpec,
  ElementCtx,
  ElementKind,
  Placement,
  TemplateName,
} from './types.js';

/**
 * The curated element kinds `renderElement` knows how to render. A `{{nyml … }}`
 * block whose `kind:` is one of these is an *element* block; any other `kind:`
 * (e.g. `document`) is not. This is the set switched on in `doc/elements.ts`.
 */
const ELEMENT_KINDS = new Set<ElementKind>([
  'article-title',
  'report-title',
  'exam-title',
  'abstract',
  'letterhead',
  'letter-inside-address',
  'letter-signature',
  'toc',
  'cv-header',
  'question-mc',
  'question-open',
  'timestamp',
]);
import {
  DEFAULTS,
  readSettings,
  normalizeRawToLayer,
  mergeSettings,
} from './doc/settings.js';
import { resolveTemplate } from './doc/templates.js';
import { buildPageCss } from './doc/page-css.js';
import { fontPreset } from './doc/fonts.js';
import { renderElement } from './doc/elements.js';
import { scanNymlBlocks } from './doc/nyml.js';

/** Unique placeholder token for the n-th element, kept off Markdown's radar. */
function placeholderFor(index: number): string {
  return `\n\n<!--ORZEL-${index}-->\n\n`;
}

/**
 * The n-th element's placeholder that keeps the text's line numbers (the
 * preview's `data-src-line` anchors): the token on the block's first line,
 * then as many line breaks as the block held. The token is an HTML comment at
 * a line start, so it is an HTML block of its own (it may interrupt a
 * paragraph) that ends on its line.
 */
function linePlaceholderFor(index: number, block: string): string {
  const breaks = (block.match(/\r\n?|\n/g) ?? []).length;
  return `<!--ORZEL-${index}-->${'\n'.repeat(breaks)}`;
}

/** What {@link prepareDocument} gives the two renderers. */
interface Prepared {
  settings: DocSettings;
  /** The body with every element block replaced by its placeholder. */
  body: string;
  /** The text before the body (the header and its line break), so a renderer can keep line numbers. */
  head: string;
  /** Each element's HTML, by index. */
  htmlByIndex: string[];
  /** Element CSS, deduplicated by kind. */
  elementCss: string;
}

/** Settings, element blocks rendered and replaced by placeholders (shared by both renderers). */
function prepareDocument(source: string, keepLines: boolean): Prepared {
  // 1. Document settings — the FC-18 header; the body is the text after it.
  const { raw, body } = readSettings(source);

  // 2. Resolve settings: DEFAULTS ← template defaults ← user overrides.
  const templateLayer = resolveTemplate(String(raw.template ?? '') as TemplateName);
  const settings = mergeSettings(DEFAULTS, templateLayer, normalizeRawToLayer(raw));

  // 3. Elements: scan the body, render each, splice in placeholders.
  const ctx: ElementCtx = {
    renderInline: (s) => md.renderInline(s),
    renderBlock: (s) => md.render(s),
    settings,
  };

  // Element blocks are `{{nyml … }}` blocks whose `kind:` names a curated
  // element (e.g. `article-title`, `abstract`). The `kind:` value is the
  // ElementKind that `renderElement` switches on and `orz-el-<kind>` reflects.
  const blocks = scanNymlBlocks(body).filter((b) =>
    ELEMENT_KINDS.has(b.kind as ElementKind),
  );

  // dedupe element CSS by kind; collect each block's rendered HTML.
  const cssByKind = new Map<string, string>();
  const htmlByIndex: string[] = [];

  // Rebuild the body left-to-right, swapping each element block for a token.
  let bodyWithPlaceholders = '';
  let cursor = 0;
  blocks.forEach((block, index) => {
    bodyWithPlaceholders += body.slice(cursor, block.start);
    bodyWithPlaceholders += keepLines ? linePlaceholderFor(index, body.slice(block.start, block.end)) : placeholderFor(index);
    cursor = block.end;

    const placement: Placement | undefined =
      block.fields.placement?.trim().toLowerCase() === 'page' ? 'page' : undefined;

    const spec: ElementSpec = {
      kind: block.kind as ElementKind,
      fields: block.fields,
      placement,
    };

    const result = renderElement(spec, ctx);
    htmlByIndex[index] = result.html;
    if (result.css && !cssByKind.has(spec.kind)) {
      cssByKind.set(spec.kind, result.css);
    }
  });
  bodyWithPlaceholders += body.slice(cursor);
  const head = source.slice(0, withoutHeader(source).offset);
  return { settings, body: bodyWithPlaceholders, head, htmlByIndex, elementCss: [...cssByKind.values()].join('\n') };
}

/** Steps 4–7: placeholders → element HTML, CSS, fonts, the assembly. */
function finishDocument(p: Prepared, contentHtml: string): PagedAssembly {
  const { settings } = p;
  // The token survives Markdown rendering as an HTML comment; replace it (a function, so `$` in the HTML stays as written).
  p.htmlByIndex.forEach((html, index) => {
    contentHtml = contentHtml.replace(`<!--ORZEL-${index}-->`, () => html ?? '');
  });

  // A table caption — the family's convention: a paragraph that opens with bold (`**Table 1.** …`) right before a
  // table — is marked, so a theme that centres its tables centres the caption with them (D-109).
  contentHtml = markTableCaptions(contentHtml);

  // 5. CSS: page CSS + deduped element CSS + custom CSS.
  const css =
    buildPageCss(settings) +
    (p.elementCss ? '\n' + p.elementCss : '') +
    (settings.customCss ? '\n' + settings.customCss : '');

  // 6. Fonts: unique non-empty stylesheet URLs across the active presets.
  const fontCssUrls: string[] = [];
  const seen = new Set<string>();
  const addFont = (name: string | undefined) => {
    if (!name) return;
    const url = fontPreset(name).cssUrl;
    if (url && !seen.has(url)) {
      seen.add(url);
      fontCssUrls.push(url);
    }
  };
  addFont(settings.fontPreset);
  addFont(settings.fontHeadingPreset);
  addFont(settings.fontMarginBoxPreset);

  // 7. Assemble.
  return {
    css,
    fontCssUrls,
    theme: settings.theme,
    bodyHtml: '<main class="orz-doc markdown-body">' + contentHtml + '</main>',
    settings,
  };
}

/**
 * Render a paged text into a {@link PagedAssembly} (synchronous; no
 * includes, no source anchors).
 */
export function renderDocument(source: string): PagedAssembly {
  const p = prepareDocument(source, false);
  // 4. Render the placeholdered body, then swap placeholders → element HTML.
  return finishDocument(p, md.render(p.body));
}

/** What {@link renderDocumentAsync} may use besides the text (the kit's `MarkdownPreviewOptions`). */
export interface RenderDocumentOptions {
  /** Resolved includes (an assembled file's `#orz-includes`): target as written → text. */
  includes?: Readonly<Record<string, string>>;
  /** A host's include resolution (URL, or a file include's path as written) → text or null. */
  fetchInclude?(target: string): Promise<string | null>;
  /**
   * `false`: links as written; default `true` (links to text twins point at
   * their `.html` form, the family names: `x.paged.md` → `x.paged.html`); a
   * `TwinNaming` (FC-18 §8.2, orz-markdown 2.5.0: the file's `#orz-shell`
   * `"links"`, a host's naming) names them so (`{ paged: '{stem}.html' }`:
   * `x.paged.md` → `x.html`).
   */
  twinLinks?: boolean | TwinNaming;
  /** A cache for fetched includes (the editor shell's `ctx.cache`). */
  cache?: Map<string, unknown>;
}

/**
 * Render a paged text as the read view and the editor preview do: like
 * {@link renderDocument}, but the body Markdown goes through the kit's
 * `renderMarkdownPreviewWithIncludes` — includes from the file's record and
 * the host (a missing one is the quiet "Included file not available" note),
 * twin links, and every block stamped with `data-src-line` (its 0-based line
 * in the whole text: element placeholders keep the line count, so the
 * editor's scroll sync maps lines to pages).
 */
export async function renderDocumentAsync(source: string, options: RenderDocumentOptions = {}): Promise<PagedAssembly> {
  const p = prepareDocument(source, true);
  const html = await renderMarkdownPreviewWithIncludes(p.head + p.body, {
    ...(options.includes ? { includes: options.includes } : {}),
    ...(options.fetchInclude ? { fetchInclude: options.fetchInclude } : {}),
    ...(options.twinLinks === false ? { twinLinks: false } : options.twinLinks && typeof options.twinLinks === 'object' ? { twinLinks: options.twinLinks } : {}),
    ...(options.cache ? { cache: options.cache } : {}),
  });
  return finishDocument(p, html);
}

/** The class of a table caption paragraph ({@link markTableCaptions}). */
export const TABLE_CAPTION_CLASS = 'orz-table-caption';

/**
 * Mark each paragraph that opens with `<strong>` and is directly followed by a
 * `<table>` (the caption convention: `**Table N.** …` on the line before a
 * table) with {@link TABLE_CAPTION_CLASS}.
 */
export function markTableCaptions(html: string): string {
  return html.replace(/<p((?:\s[^>]*)?)>(?=<strong>)((?:(?!<\/p>)[\s\S])*)<\/p>(\s*)(?=<table[\s>])/g, (_m, attrs: string, inner: string, ws: string) => {
    const withClass = /\sclass="/.test(attrs) ? attrs.replace(/\sclass="/, ` class="${TABLE_CAPTION_CLASS} `) : `${attrs} class="${TABLE_CAPTION_CLASS}"`;
    return `<p${withClass}>${inner}</p>${ws}`;
  });
}
