/**
 * Renders a paged text with a theme in real Chrome the way the engine does:
 * renderDocument → stage the body (so webfonts load) → paged.js Previewer with
 * [base.css, theme, page CSS] → the paginated pages. Used by tests/themes.test.ts
 * (and for the owner's screenshots in /tmp/paged-themes).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { PREVIEW_CDN } from 'orz-markdown/preview-frame';
import { renderDocument } from '../src/render-paged.js';
import { themeStylesheets, themeFontUrls } from '../src/themes.js';

const PAGED_JS = join('node_modules/pagedjs/dist/paged.js');

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
}

/** Paginate `text` in a fresh page of `browser`; the caller closes `result.page`. */
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
  const links = fonts.map((u) => `<link rel="stylesheet" href="${u}">`).join('\n');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${links}
<style>body{margin:0;background:#888}.pagedjs_pages{display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0}</style>
</head><body><div id="out"></div></body></html>`, { waitUntil: 'load', timeout: 30_000 }).catch(() => undefined);
  await page.addScriptTag({ path: PAGED_JS });
  const pages = await page.evaluate(
    async ({ body, base, theme, pageCss }) => {
      // stage with the stylesheets so the theme's webfonts are requested and loaded before layout
      const style = document.createElement('style');
      style.textContent = base + '\n' + theme + '\n' + pageCss;
      document.head.appendChild(style);
      const stage = document.createElement('div');
      stage.style.cssText = 'position:absolute;left:-99999px;top:0;width:680px';
      stage.innerHTML = body;
      document.body.appendChild(stage);
      await document.fonts.ready;
      stage.remove();
      style.remove();
      const w = window as unknown as { Paged: { Previewer: new () => { preview: (c: string, s: unknown[], to: Element) => Promise<{ total: number }> } } };
      const flow = await new w.Paged.Previewer().preview(body, [{ 'orz-base.css': base }, { 'orz-theme.css': theme }, { 'orz-page.css': pageCss }], document.getElementById('out')!);
      await document.fonts.ready;
      return flow.total;
    },
    { body: a.bodyHtml, base: baseCss, theme: themeCss, pageCss: a.css },
  );
  return { page, pages, errors };
}
