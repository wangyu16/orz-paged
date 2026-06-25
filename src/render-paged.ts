/**
 * Assembler — A1.
 *
 * `assemble(source)` turns a Markdown source into a {@link PagedAssembly}: pure
 * data (CSS, font URLs, theme, body HTML, resolved settings) that the browser
 * engine then hands to paged.js for pagination. No DOM here.
 *
 * Pipeline (DESIGN §3/§6):
 *   1. `parseDocSettings` extracts + strips the `{{nyml kind: document}}` block.
 *   2. Merge DEFAULTS ← template layer ← user overrides → resolved settings.
 *   3. Scan the remaining body for `{{nyml kind: element}}` blocks, render each
 *      via `renderElement`, and replace it with a placeholder token.
 *   4. Render the placeholdered body Markdown, then swap each placeholder for
 *      its element's HTML (so element HTML is never re-parsed as Markdown).
 *   5. Compose page CSS + deduped element CSS + custom CSS; collect font URLs.
 */

import { md } from 'orz-markdown';

import type {
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
  parseDocSettings,
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
 * Assemble a Markdown source into a {@link PagedAssembly}.
 */
export function assemble(source: string): PagedAssembly {
  // 1. Document settings — strips the `kind: document` block from the body.
  const { raw, body } = parseDocSettings(source);

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
    bodyWithPlaceholders += placeholderFor(index);
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

  // 4. Render the placeholdered body, then swap placeholders → element HTML.
  let contentHtml = md.render(bodyWithPlaceholders);
  htmlByIndex.forEach((html, index) => {
    // The token survives Markdown rendering as an HTML comment; replace it.
    contentHtml = contentHtml.replace(`<!--ORZEL-${index}-->`, html ?? '');
  });

  // 5. CSS: page CSS + deduped element CSS + custom CSS.
  const elementCss = [...cssByKind.values()].join('\n');
  const css =
    buildPageCss(settings) +
    (elementCss ? '\n' + elementCss : '') +
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
