import { describe, it, expect } from 'vitest';
import { buildPageCss } from '../src/doc/page-css.js';
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

    theme: 'none',
    ...over,
  };
}

describe('buildPageCss — @page size & margins', () => {
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

describe('buildPageCss — page numbers', () => {
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

describe('buildPageCss — running headers/footers', () => {
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

describe('buildPageCss — :root tokens', () => {
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

describe('buildPageCss — front matter clean', () => {
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

describe('buildPageCss — layout behavior', () => {
  it('emits all enabled layout rules', () => {
    const css = buildPageCss(makeSettings());
    expect(css).toContain('img { max-width: 100%; max-height: 100%; }');
    expect(css).toContain('img, figure { break-inside: avoid; }');
    expect(css).toContain('thead { display: table-header-group; }');
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
    expect(css).not.toContain('table-header-group');
    expect(css).not.toContain('max-height: 100%');
  });
});

describe('buildPageCss — first-page suppression', () => {
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
