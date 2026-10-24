import { describe, it, expect } from 'vitest';
import { buildPageCss, FURNITURE_FALLBACK_COLOR, FURNITURE_FALLBACK_FONT } from '../src/doc/page-css.js';
import { readFileSync } from 'node:fs';
import { THEME_INFO } from '../src/themes.js';
import type { DocSettings } from '../src/types.js';

/** A fully-resolved DocSettings literal (no imports from other modules). */
function makeSettings(over: Partial<DocSettings> = {}): DocSettings {
  return {
    pageSize: 'A4',
    marginTop: 20,
    marginBottom: 25,
    marginLeft: 18,
    marginRight: 15,

    fontPreset: 'lora',
    fontSize: 12,
    lineHeight: 1.5,
    decorationColor: '#2962a4',

    pageNumberPosition: 'footer-center',
    pageNumberStyle: 'page-n-of-N',
    pageNumberStartPage: 1,
    firstPageSkipNumber: false,

    headerLeft: '',
    headerCenter: 'My Document',
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

    limitImageToPage: true,
    keepImageTogether: true,
    repeatTableHeader: true,
    avoidTableRowBreaks: true,

    frontMatterClean: false,
    theme: 'none',
    dynamicChoices: {},
    ...over,
  };
}

describe('[T.2] buildPageCss — @page size & margins', () => {
  it('emits size and 4-value margin in mm (top right bottom left)', () => {
    const css = buildPageCss(makeSettings());
    expect(css).toContain('size: A4;');
    expect(css).toContain('margin: 20mm 15mm 25mm 18mm;');
  });

  it('passes a custom size string straight through', () => {
    const css = buildPageCss(makeSettings({ pageSize: '210mm 297mm' }));
    expect(css).toContain('size: 210mm 297mm;');
  });
});

describe('[T.2] buildPageCss — page numbers', () => {
  it('places the page-n-of-N expr in @bottom-center for footer-center', () => {
    const css = buildPageCss(makeSettings());
    expect(css).toMatch(/@bottom-center\s*\{[^}]*content:\s*"Page " counter\(page\) " of " counter\(pages\)/);
  });

  it('header-right + simple → counter(page) in @top-right', () => {
    const css = buildPageCss(
      makeSettings({
        pageNumberPosition: 'header-right',
        pageNumberStyle: 'simple',
        headerCenter: '',
      }),
    );
    expect(css).toMatch(/@top-right\s*\{[^}]*content:\s*counter\(page\)/);
  });

  it('dash-n-dash style', () => {
    const css = buildPageCss(
      makeSettings({ pageNumberStyle: 'dash-n-dash' }),
    );
    expect(css).toContain('content: "— " counter(page) " —"');
  });

  it('none → no page-number content emitted', () => {
    const css = buildPageCss(
      makeSettings({ pageNumberPosition: 'none', headerCenter: '', footerCenter: '' }),
    );
    expect(css).not.toContain('counter(page)');
  });
});

describe('[T.2] buildPageCss — running headers/footers', () => {
  it('puts static header text in the right box with its font size', () => {
    const css = buildPageCss(makeSettings({ headerCenter: 'My Document' }));
    expect(css).toMatch(/@top-center\s*\{[^}]*content:\s*"My Document"/);
    expect(css).toContain('font-size: 9pt;');
  });

  it('escapes double-quotes and backslashes in header text', () => {
    const css = buildPageCss(
      makeSettings({ headerLeft: 'a "quote" \\ slash', pageNumberPosition: 'none' }),
    );
    expect(css).toContain('content: "a \\"quote\\" \\\\ slash"');
  });

  it('draws header/footer rules using decorationColor by default', () => {
    const css = buildPageCss(makeSettings({ decorationColor: '#abcdef' }));
    expect(css).toContain('border-bottom: 0.5pt solid #abcdef;');
    expect(css).toContain('border-top: 0.5pt solid #abcdef;');
  });

  it('rule color falls back to explicit *RuleColor over decorationColor', () => {
    const css = buildPageCss(
      makeSettings({ headerRuleColor: '#111111', decorationColor: '#999999' }),
    );
    expect(css).toContain('border-bottom: 0.5pt solid #111111;');
  });
});

describe('[T.2] buildPageCss — :root tokens', () => {
  it('emits the dom-contract CSS variables', () => {
    const css = buildPageCss(makeSettings({ pageBackground: '#fdf8f0' }));
    expect(css).toContain('--font-size: 12pt;');
    expect(css).toContain('--line-height: 1.5;');
    expect(css).toContain('--accent: #2962a4;');
    expect(css).toContain('--page-bg: #fdf8f0;');
    expect(css).toContain('--margin-t: 20mm;');
    expect(css).toContain('--font-body:');
    expect(css).toContain('Lora');
  });

  it('omits --page-bg / --accent when unset so the theme can provide them', () => {
    const css = buildPageCss(makeSettings({ pageBackground: undefined, decorationColor: undefined }));
    expect(css).not.toContain('--page-bg:');
    expect(css).not.toContain('--accent:');
    // header/footer rules still resolve, falling back to the (theme) accent.
    expect(css).toContain('--header-rule: var(--accent, #cccccc);');
  });
});

describe('[T.2] buildPageCss — front matter clean', () => {
  it('off by default: native counters, no front-matter hide', () => {
    const css = buildPageCss(makeSettings());
    expect(css).not.toContain('pagedjs_orz-front_page');
    expect(css).not.toContain('--orz-pageno');
    expect(css).toContain('counter(page) " of " counter(pages)');
  });
  it('on: hides front-matter chrome and renumbers the body via CSS vars', () => {
    const css = buildPageCss(makeSettings({ frontMatterClean: true }));
    expect(css).toContain('.pagedjs_orz-front_page .pagedjs_margin-top');
    expect(css).toContain('.pagedjs_orz-front_page .pagedjs_margin-bottom');
    expect(css).toContain('display: none;');
    // page-number expr uses the JS-fed vars (current + body total), with the
    // native counters as fallbacks.
    expect(css).toContain('var(--orz-pageno, counter(page))');
    expect(css).toContain('var(--orz-body-pages, counter(pages))');
  });
});

describe('[T.2] buildPageCss — layout behavior', () => {
  it('emits all enabled layout rules', () => {
    const css = buildPageCss(makeSettings());
    expect(css).toContain('img { max-width: 100%; max-height: 100%; }');
    expect(css).toContain('img, figure { break-inside: avoid; }');
    expect(css).toContain('table { --orz-repeat-thead: 1; }');
    expect(css).toContain('tr { break-inside: avoid; }');
  });

  it('omits layout rules when disabled', () => {
    const css = buildPageCss(
      makeSettings({
        limitImageToPage: false,
        keepImageTogether: false,
        repeatTableHeader: false,
        avoidTableRowBreaks: false,
      }),
    );
    expect(css).not.toContain('--orz-repeat-thead');
    expect(css).not.toContain('max-height: 100%');
  });

  it('[P.11] a table\'s first body row never leaves its header alone at a page bottom (`tbody > tr:first-child { break-before: avoid }`, with or without the repeated header and row breaks)', () => {
    for (const over of [{}, { repeatTableHeader: false, avoidTableRowBreaks: false }]) {
      expect(buildPageCss(makeSettings(over))).toContain('tbody > tr:first-child { break-before: avoid; }');
    }
  });
});

describe('[T.2] buildPageCss — first-page suppression', () => {
  it('hides header boxes on @page:first when firstPageHideHeader', () => {
    const css = buildPageCss(makeSettings({ firstPageHideHeader: true }));
    expect(css).toMatch(/@page:first\s*\{[^]*@top-center\s*\{\s*content:\s*none/);
  });

  it('hides footer boxes when firstPageHideFooter', () => {
    const css = buildPageCss(makeSettings({ firstPageHideFooter: true }));
    expect(css).toMatch(/@page:first\s*\{[^]*@bottom-center\s*\{\s*content:\s*none/);
  });

  it('no @page:first rule when nothing is hidden', () => {
    const css = buildPageCss(makeSettings());
    expect(css).not.toContain('@page:first');
  });
});

describe('page furniture takes the theme', () => {
  it('[P.12] the margin boxes (running headers/footers, page numbers) use the theme\'s furniture tokens — every theme (none too) sets --orz-furniture-font to its body font and --orz-furniture-color to its muted text colour — with fallbacks when a theme sets none; an explicit font_margin_box_preset still wins', () => {
    const css = buildPageCss(makeSettings({ fontPreset: undefined, fontFamily: undefined }));
    expect(css).toContain(`--font-margin-box: var(--orz-furniture-font, var(--font-body, ${FURNITURE_FALLBACK_FONT}));`);
    expect(css).toMatch(/\.pagedjs_margin-bottom-right \{\n  font-family: var\(--font-margin-box\);\n  color: var\(--orz-furniture-color, var\(--text-muted, #555555\)\);\n\}/);
    expect(FURNITURE_FALLBACK_COLOR).toBe('#555555');
    // an explicit body font: the theme's token follows --font-body, which the page CSS sets
    const lora = buildPageCss(makeSettings({ fontPreset: 'lora' }));
    expect(lora).toMatch(/--font-body: .*Lora/);
    expect(lora).toMatch(/--font-margin-box: var\(--orz-furniture-font, var\(--font-body, .*Lora/);
    // font_margin_box_preset wins
    expect(buildPageCss(makeSettings({ fontMarginBoxPreset: 'inter' }))).toMatch(/--font-margin-box: [^;]*Inter/);
    for (const t of THEME_INFO) {
      const text = readFileSync(t.stylesheet, 'utf8');
      expect(text, t.id).toContain('--orz-furniture-font: var(--font-body);');
      expect(text, t.id).toContain('--orz-furniture-color: var(--text-muted);');
      expect(text, t.id).toMatch(/--text-muted: [^;]+;/);
    }
  });
});

describe('[P.13] print themes: charts, diagrams and table captions (D-109)', () => {
  const TOKENS = ['--chart-text', '--chart-grid', '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--mm-text', '--mm-line', '--mm-node', '--mm-border', '--mm-accent', '--mm-note'];
  it('[P.13] a table caption (a paragraph opening with bold right before a table) is marked; light-academic-1, which centres its tables, centres it; other paragraphs are not marked', async () => {
    const { renderDocument, TABLE_CAPTION_CLASS } = await import('../src/render-paged.js');
    const html = renderDocument('Intro with **bold** in it.\n\n| a |\n|---|\n| 1 |\n\n**Table 1.** Yield by catalyst.\n\n| a |\n|---|\n| 1 |\n\n**Bold** but no table after.\n\nEnd.\n').bodyHtml;
    expect(html.match(new RegExp(`<p[^>]*class="${TABLE_CAPTION_CLASS}"[^>]*><strong>Table 1\\.</strong> Yield by catalyst\\.</p>\\s*<table`, 'g'))).toHaveLength(1);
    expect(html.split(TABLE_CAPTION_CLASS).length - 1).toBe(1);
    expect(readFileSync('node_modules/orz-markdown/themes/light-academic-1.css', 'utf8')).toMatch(/\.markdown-body table \{\s*margin: 2em auto;/);
    expect(readFileSync('assets/themes/light-academic-1.css', 'utf8')).toMatch(/\.markdown-body p\.orz-table-caption \{\s*text-align: center;\s*\}/);
  });
  it('[P.13] the chart and diagram tokens: `none` (hand-written) sets every one; a derived theme carries them whenever the installed orz-markdown theme does (2.4.0 on), so the move to that kit colours charts and Mermaid in the print theme', () => {
    const none = readFileSync('assets/themes/plain/none.css', 'utf8');
    for (const t of TOKENS) expect(none, t).toMatch(new RegExp(`${t}:\\s*[^;]+;`));
    for (const th of THEME_INFO.filter((x) => x.id !== 'none')) {
      const source = readFileSync(`node_modules/orz-markdown/themes/${th.id}.css`, 'utf8');
      const derived = readFileSync(`assets/themes/${th.id}.css`, 'utf8');
      for (const t of TOKENS) if (new RegExp(`${t}:`).test(source)) expect(derived, `${th.id} ${t}`).toMatch(new RegExp(`${t}:`));
      // 1.1.0 is on orz-markdown ^2.5.0 (release.config.json kit.required): every derived theme carries every token
      for (const t of TOKENS) expect(derived, `${th.id} ${t} (kit ${JSON.parse(readFileSync('release.config.json', 'utf8')).kit.required})`).toMatch(new RegExp(`${t}:\\s*[^;]+;`));
    }
  });
});

describe('[P.14] the theme picker\'s dots (D-95)', () => {
  it('[P.14] each print theme\'s dot is the kit\'s themeSwatch of its source theme (paper and signature colour, orz-markdown 2.5.0) — different for every theme; `none` a plain dot of its own', async () => {
    const { themeSwatch } = await import('orz-markdown/themes');
    const { themeChoices } = await import('../src/browser/paged/themes.js');
    const { THEME_INFO: INFO } = await import('../src/themes.js');
    const choices = themeChoices();
    expect(choices.map((c) => c.value)).toEqual(INFO.map((t) => t.id));
    for (const c of choices) {
      const src = INFO.find((t) => t.id === c.value)!.source;
      if (src) expect(c.swatch, c.value).toBe(themeSwatch(src));
      else expect(c.swatch, c.value).toMatch(/^linear-gradient\(135deg, #ffffff 50%/);
    }
    expect(new Set(choices.map((c) => c.swatch)).size).toBe(choices.length);
  });
});
