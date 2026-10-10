/**
 * Renders a paged text with a theme in real Chrome the way the engine does:
 * renderDocument → the paged runtime (src/paged/runtime.ts, built by
 * build/bundle.ts: the stage with the theme so webfonts load, enhancement,
 * Paged.js with [base.css, theme, page CSS] and the baseline-grid and
 * two-column handlers) → the paginated pages. Used by tests/themes.test.ts
 * (and for the owner's screenshots in /tmp/paged-themes).
 */
import { readFileSync } from 'node:fs';
import type { Browser, Page } from 'playwright-core';
import { PREVIEW_CDN } from 'orz-markdown/preview-frame';
import { renderDocument } from '../src/render-paged.js';
import { buildRuntime } from '../build/bundle.js';
import { themeStylesheets, themeFontUrls } from '../src/themes.js';


/** A rich first page: title, headings, list, table, code, quote, callouts, math, two columns, badges. */
export function sampleText(theme: string): string {
  return `{{nyml
kind: document
title: Field Notes on Print Themes
theme: ${theme}
page_size: A4
font_size: 9.5
header_right: Field Notes
footer_left: orz-paged
}}

# Field Notes on Print Themes

A paged document is set for **paper**: *running text*, a [link](https://markdown.orz.how), \`inline code\`, ==marked text== and a footnote.[^1] Colours {{sp[red] red}}, {{sp[green] green}}, {{sp[blue] blue}}; badges {{sp[success] done}} {{sp[warning] check}}.

## Lists and a table, in two columns

:::: cols
::: col
- Headings keep the theme's face
- Lists keep their markers
  - nested items too

1. Numbered steps
2. In order
:::
::: col
| Theme | Paper | No. |
|:--|:--|--:|
| academic | cream | 1 |
| neat | white | 2 |
| playful | notebook | 3 |
:::
::::

::: info
**Note.** A callout keeps its frame and mark on paper.
:::

::: warning
**Careful.** Tints print as designed.
:::

### Code and math

\`\`\`js
function area(r) {
  return Math.PI * r ** 2; // circle
}
\`\`\`

The area is $A = \\pi r^2$, and

$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$

> A quotation sits apart from the text, the way the theme sets it off.

---

#### A fourth-level heading

Closing words.

[^1]: A footnote at the end of the text.
`;
}

export interface RenderResult {
  page: Page;
  pages: number;
  errors: string[];
  /** The baseline grid's report (src/paged/baseline-grid.ts; `grid` 0 for a theme without one). */
  grid: { grid: number; ruleAt: number; snapped: number; offGrid: number };
}

let runtime: Promise<string> | null = null;

/** Paginate `text` in a fresh page of `browser` through the real paged runtime (Paged.js + the grid and column handlers); the caller closes `result.page`. */
export async function renderPaged(browser: Browser, text: string, opts: { scale?: number } = {}): Promise<RenderResult> {
  const a = renderDocument(text);
  const [baseCss, themeCss] = themeStylesheets(a.theme).map((p) => readFileSync(p, 'utf8'));
  const fonts = [...themeFontUrls(a.theme), ...a.fontCssUrls, PREVIEW_CDN.katexCss, PREVIEW_CDN.hljsLightCss];
  const page = await browser.newPage({ viewport: { width: 1000, height: 1300 }, deviceScaleFactor: opts.scale ?? 1.5 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:0;background:#888}.pagedjs_pages{display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0}</style>
</head><body><div id="out"></div></body></html>`, { waitUntil: 'load', timeout: 30_000 }).catch(() => undefined);
  await page.addScriptTag({ content: await (runtime ??= buildRuntime()) });
  const sheets = [{ name: 'orz-base.css', css: baseCss }, ...(themeCss ? [{ name: 'orz-theme.css', css: themeCss }] : []), { name: 'orz-page.css', css: a.css }];
  const result = await page.evaluate(
    async (input) => {
      const w = window as unknown as { __orzPaged: { paginate(i: unknown, t: Element): Promise<{ pages: number; grid: { grid: number; ruleAt: number; snapped: number; offGrid: number } }> } };
      const r = await w.__orzPaged.paginate(input, document.getElementById('out')!);
      await document.fonts.ready;
      return { pages: r.pages, grid: r.grid };
    },
    { bodyHtml: a.bodyHtml, sheets, links: fonts, frontMatterClean: a.settings.frontMatterClean, dynamicChoices: { ...a.settings.dynamicChoices } },
  );
  return { page, pages: result.pages, grid: result.grid, errors };
}
