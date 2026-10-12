/**
 * The print themes (claims P.1–P.8): nine themes derived from orz-markdown's
 * light themes by scripts/build-themes.ts, checked as files (what they may not
 * contain), as data (tokens, fonts), and in real Chrome through paged.js
 * (they parse, paginate a rich sample, load their fonts, read well on paper).
 * Screenshots of each first page go to /tmp/paged-themes/<id>.png.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { THEMES as SOURCE_THEMES } from 'orz-markdown/themes';
import { THEMES, THEME_INFO, DEFAULT_THEME, isThemeId, themeStylesheet, themeStylesheets, themeFontUrls, BASE_STYLESHEET } from '../src/themes.js';
import { THEME_FONTS } from '../src/doc/theme-fonts.js';
import { generate, SPECS, printShadow, withoutViewport, relativeFontSize, expandSelector, parseNodes, stripComments, parseDecls, splitTop, type CssNode } from '../scripts/build-themes.js';
import { launchChrome } from './helpers.js';
import { renderPaged, sampleText } from './theme-render.js';

const LIGHT = SOURCE_THEMES.filter((t) => t.scheme === 'light').map((t) => t.id);
const DERIVED = THEME_INFO.filter((t) => t.source !== null);
const css = (path: string): string => readFileSync(path, 'utf8');
const SHEETS: Array<[string, string]> = [['base', BASE_STYLESHEET], ...DERIVED.map((t): [string, string] => [t.id, t.stylesheet])];

/** Every rule of a stylesheet, at any depth: [selector list, declarations]. */
function rules(text: string): Array<{ selectors: string[]; body: string }> {
  const walk = (nodes: CssNode[]): Array<{ selectors: string[]; body: string }> =>
    nodes.flatMap((n) => (n.kind === 'rule' ? [{ selectors: splitTop(n.selector, ','), body: n.body }] : n.body !== null && /^(media|supports)$/.test(n.name) ? walk(parseNodes(n.body)) : []));
  return walk(parseNodes(stripComments(text)));
}

describe('print themes as files', () => {
  it('[P.1] one print theme per light orz-markdown theme, same ids and order, plus none; the old ids stay valid; the default is one of them', () => {
    expect(DERIVED.map((t) => t.id)).toEqual(LIGHT);
    expect(LIGHT).toHaveLength(9);
    expect([...THEMES]).toEqual([...LIGHT, 'none']);
    expect(Object.keys(SPECS)).toEqual(LIGHT);
    for (const t of DERIVED) {
      expect(t.source).toBe(t.id);
      expect(t.label).toBe(SOURCE_THEMES.find((s) => s.id === t.id)!.name);
      expect(themeStylesheet(t.id)).toBe(`assets/themes/${t.id}.css`);
      expect(existsSync(t.stylesheet), t.stylesheet).toBe(true);
    }
    expect(existsSync(themeStylesheet('none'))).toBe(true);
    expect(themeStylesheets('light-neat-1')).toEqual([BASE_STYLESHEET, 'assets/themes/light-neat-1.css']);
    for (const old of ['light-neat-1', 'light-neat-2', 'light-neat-3', 'light-academic-1', 'light-academic-2', 'beige-decent-1', 'beige-decent-2']) expect(isThemeId(old), old).toBe(true);
    expect(isThemeId('light-playful-1') && isThemeId('light-playful-2')).toBe(true);
    expect(isThemeId('dark-elegant-1')).toBe(false);
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    // the stylesheets in assets/themes are exactly the derived themes
    expect(readdirSync('assets/themes').filter((f) => f.endsWith('.css') && f !== 'base.css').map((f) => f.slice(0, -4)).sort()).toEqual([...LIGHT].sort());
  });

  it('[P.1] the committed theme files are what scripts/build-themes.ts writes from the installed orz-markdown', () => {
    const files = generate();
    expect(files.size).toBe(LIGHT.length + 2);
    for (const [path, content] of files) expect(readFileSync(path, 'utf8') === content, `${path} is stale: run npx tsx scripts/build-themes.ts`).toBe(true);
    for (const id of LIGHT) expect(css(`assets/themes/${id}.css`)).toContain(`orz-markdown ${JSON.parse(css('node_modules/orz-markdown/package.json')).version} themes/${id}.css`);
  });

  const FORBIDDEN: Array<[string, RegExp]> = [
    ['@media', /@media\b/],
    ['@import', /@import\b/],
    ['@keyframes', /@keyframes\b/],
    ['interactive state', /:(hover|focus|focus-visible|focus-within|active|visited)\b/],
    ['selection', /::selection/],
    ['scrollbar', /::-webkit-scrollbar/],
    ['transition', /(^|[;{\s])(-webkit-)?transition(-[\w-]+)?\s*:/m],
    ['animation', /(^|[;{\s])(-webkit-)?animation(-[\w-]+)?\s*:/m],
    ['cursor', /(^|[;{\s])cursor\s*:/m],
    ['scroll', /(^|[;{\s])scroll(bar)?-[\w-]+\s*:/m],
    ['user-select', /(^|[;{\s])(-webkit-)?user-select\s*:/m],
    ['backdrop-filter', /backdrop-filter/],
    ['fixed/sticky', /position\s*:\s*(fixed|sticky)/],
    ['viewport unit', /\d(vw|vh|vmin|vmax)\b/],
    ['QR overlay', /\.qrcode-overlay/],
    // light-playful-1's screen notebook (orz-markdown >= 2.3.0, inside @media screen): its ruling is the
    // article's background; on paper the page box draws the ruling (the layer), so it must never come through
    ['the source\'s screen ruling', /background-origin\s*:[^;]*content-box|--orz-rule\s*:/],
  ];

  it('[P.2] no print theme (nor base.css) carries a screen-only construct', () => {
    for (const [id, path] of SHEETS) {
      const text = stripComments(css(path));
      for (const [name, re] of FORBIDDEN) expect(re.test(text), `${id}: ${name}`).toBe(false);
      for (const r of rules(text)) {
        for (const s of r.selectors) expect(/^(html|body)\b/.test(s), `${id}: ${s}`).toBe(false);
        for (const d of parseDecls(r.body).filter((d) => d.prop === 'box-shadow' || (d.prop.startsWith('--') && /shadow/.test(d.prop)))) {
          expect(printShadow(d.value), `${id}: blurred shadow ${d.value}`).toBe(d.value);
        }
      }
    }
  });

  it('[P.3] no comma inside :is()/:where()/:has()/:not() (paged.js splits selectors on commas)', () => {
    for (const [id, path] of [...SHEETS, ['none', themeStylesheet('none')]]) {
      for (const r of rules(css(path))) for (const s of r.selectors) expect(expandSelector(s), `${id}: ${s}`).toEqual([s]);
    }
  });

  it('[P.4] each theme sets the paged tokens from its source and re-points the source variables at them', () => {
    for (const t of DERIVED) {
      const spec = SPECS[t.id];
      const root = rules(css(t.stylesheet)).find((r) => r.selectors.length === 1 && r.selectors[0] === ':root')!;
      const decls = Object.fromEntries(parseDecls(root.body).map((d) => [d.prop, d.value]));
      for (const token of ['--page-bg', '--accent', '--font-body', '--font-heading', '--font-code', '--text-main', '--heading-color']) expect(decls[token], `${t.id} ${token}`).toBeTruthy();
      expect(decls['--page-bg'], t.id).toMatch(/^#[0-9a-f]{6}$/i);
      for (const v of spec.paper) if (v !== '--page-bg') expect(decls[v], `${t.id} ${v}`).toBe('var(--page-bg)');
      if (spec.accent !== '--accent') expect(decls[spec.accent], t.id).toBe('var(--accent)');
      if (spec.fonts.body !== '--font-body') expect(decls[spec.fonts.body], t.id).toBe('var(--font-body)');
      expect(decls['--base-size'] ?? '1em', t.id).toBe('1em');
    }
  });

  it('[P.7] each theme\'s webfonts are exactly the stylesheets its source imports, and its families are the source\'s', () => {
    for (const t of DERIVED) {
      const source = css(`node_modules/orz-markdown/themes/${t.id}.css`);
      const imports = [...source.matchAll(/@import\s+url\(['"]?(https:[^'")]+)['"]?\)/g)].map((m) => m[1]);
      expect(imports.length, t.id).toBeGreaterThan(0);
      expect([...themeFontUrls(t.id)], t.id).toEqual(imports);
      const f = THEME_FONTS[t.id];
      for (const fam of [f.body, f.heading, f.code]) expect(source, t.id).toContain(fam);
      // the first named family of the headings is one the stylesheet loads
      const heading = /^['"]([^'"]+)['"]/.exec(f.heading)![1];
      expect(imports.join(' '), `${t.id} ${heading}`).toContain(heading.replace(/ /g, '+'));
    }
    expect(themeFontUrls('none')).toEqual([]);
  });

  it('[P.8] the transforms keep what prints and drop what does not', () => {
    expect(printShadow('0 8px 24px rgba(0,0,0,.1)')).toBe('none');
    expect(printShadow('2px 2px 0px rgba(34, 34, 34, 0.4)')).toBe('2px 2px 0px rgba(34, 34, 34, 0.4)');
    expect(printShadow('inset 0 2px 0 var(--x), 0 6px 18px -10px rgba(0,0,0,.1)')).toBe('inset 0 2px 0 var(--x)');
    expect(printShadow('0 0 0 3px color-mix(in srgb, red 18%, transparent)')).toBe('0 0 0 3px color-mix(in srgb, red 18%, transparent)');
    expect(withoutViewport('clamp(1.95rem, 4.2vw, 2.7rem)')).toBe('2.7rem');
    expect(withoutViewport('clamp(1rem, 2em, 3rem)')).toBe('clamp(1rem, 2em, 3rem)');
    expect(relativeFontSize('3.2rem', 16)).toBe('3.2em');
    expect(relativeFontSize('18px', 18)).toBe('1em');
    expect(relativeFontSize('calc(1.2rem + 4px)', 20)).toBe('calc(0.96em + 0.2em)');
    expect(relativeFontSize('1.1em', 18)).toBe('1.1em');
    expect(expandSelector('.a :is(.b, .c) > p')).toEqual(['.a :is(.b) > p', '.a :is(.c) > p']);
    expect(expandSelector(':where(.a, .b) h1')).toEqual([':where(.a) h1', ':where(.b) h1']);
    expect(expandSelector('ul:not(.x, .y)')).toEqual(['ul:not(.x):not(.y)']);
    expect(expandSelector('.m :is(a, b):is(c, d)')).toHaveLength(4);
    expect(expandSelector(':where(.markdown-body) p')).toEqual([':where(.markdown-body) p']);
  });
});

/* ───────────────────────────── real Chrome ───────────────────────────── */

const browser = await launchChrome();
const chrome = browser ? describe : describe.skip;
afterAll(async () => {
  await browser?.close();
});

const SHOTS = '/tmp/paged-themes';

chrome('print themes in real Chrome (paged.js)', () => {
  it('[P.3] Chrome parses every rule the build wrote', async () => {
    const page = await browser!.newPage();
    const counts = await page.evaluate((sheets) => sheets.map(([id, text]) => {
      const s = new CSSStyleSheet();
      s.replaceSync(text);
      return [id, s.cssRules.length] as const;
    }), [...SHEETS, ['none', themeStylesheet('none')]].map(([id, p]) => [id, css(p)] as [string, string]));
    for (const [id, n] of counts) {
      const path = id === 'base' ? BASE_STYLESHEET : themeStylesheet(id);
      expect(n, id).toBe(parseNodes(stripComments(css(path))).length);
    }
    await page.close();
  });

  for (const id of [...LIGHT, 'none']) {
    it(`[P.5] [P.6] ${id}: paginates the rich sample with its fonts; text and headings reach 4.5:1 in colour and greyscale`, async () => {
      const r = await renderPaged(browser!, sampleText(id));
      try {
        expect(r.errors, id).toEqual([]);
        expect(r.pages, id).toBeGreaterThanOrEqual(1);
        mkdirSync(SHOTS, { recursive: true });
        await r.page.locator('.pagedjs_page').first().screenshot({ path: `${SHOTS}/${id}.png`, timeout: 60_000 });

        const report = await r.page.evaluate(() => {
          const page = document.querySelector('.pagedjs_page') as HTMLElement;
          const doc = page.querySelector('.orz-doc') as HTMLElement;
          const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
          const rgba = (c: string): number[] => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = '#000';
            ctx.fillStyle = c;
            ctx.fillRect(0, 0, 1, 1);
            const d = ctx.getImageData(0, 0, 1, 1).data;
            return [d[0], d[1], d[2], d[3] / 255];
          };
          const over = (top: number[], under: number[]): number[] => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
          const backdrop = (el: Element): number[] => {
            const layers: number[][] = [];
            for (let e: Element | null = el; e; e = e.parentElement) {
              const c = rgba(getComputedStyle(e).backgroundColor);
              if (c[3] > 0) layers.push(c);
              if (c[3] >= 1 || e === page) break;
            }
            let acc = [255, 255, 255, 1];
            for (const l of layers.reverse()) acc = over(l, acc);
            return acc;
          };
          const lum = (c: number[]): number => {
            const [r, g, b] = c.slice(0, 3).map((v) => {
              const s = v / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const grey = (c: number[]): number[] => {
            const y = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
            return [y, y, y, 1];
          };
          const ratio = (a: number[], b: number[]): number => {
            const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
            return (hi + 0.05) / (lo + 0.05);
          };
          const texts = [...doc.querySelectorAll(':scope > p, :scope > ul > li, :scope > ol > li, :scope h1, :scope h2, :scope h3, :scope h4, :scope td, :scope th')]
            .filter((e) => (e.textContent ?? '').trim().length > 0 && !e.closest('.footnotes'));
          const results = texts.map((e) => {
            const cs = getComputedStyle(e);
            const stroke = parseFloat(cs.getPropertyValue('-webkit-text-stroke-width')) || 0;
            const bg = backdrop(e);
            const ink = over(rgba(stroke >= 1 ? cs.getPropertyValue('-webkit-text-stroke-color') : cs.color), bg);
            return { tag: e.tagName.toLowerCase(), text: (e.textContent ?? '').trim().slice(0, 30), color: ratio(ink, bg), grey: ratio(grey(ink), grey(bg)) };
          });
          const family = (sel: string): string => getComputedStyle(doc.querySelector(sel)!).fontFamily;
          const firstFamily = (stack: string): string => stack.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
          const fontSheetsLoaded = [...document.querySelectorAll('link[rel=stylesheet]')].every((l) => (l as HTMLLinkElement).sheet !== null);
          const headingFamily = firstFamily(family('h2'));
          const bodyFamily = firstFamily(family(':scope > p'));
          return {
            results,
            pageBg: getComputedStyle(page).backgroundColor,
            fontSheetsLoaded,
            headingFamily,
            bodyFamily,
            headingLoaded: document.fonts.check(`16px "${headingFamily}"`),
            bodyLoaded: document.fonts.check(`16px "${bodyFamily}"`),
            webfontFaces: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/^['"]|['"]$/g, '')),
          };
        });

        expect(report.results.length, id).toBeGreaterThan(10);
        for (const x of report.results) {
          expect(x.color, `${id} ${x.tag} "${x.text}" colour contrast`).toBeGreaterThanOrEqual(4.5);
          expect(x.grey, `${id} ${x.tag} "${x.text}" greyscale contrast`).toBeGreaterThanOrEqual(4.5);
        }
        // the theme's own families are the ones in use, and its webfonts loaded (when the CDN answered)
        if (id !== 'none') {
          const fonts = THEME_FONTS[id as keyof typeof THEME_FONTS];
          expect(fonts.heading, id).toContain(report.headingFamily);
          expect(fonts.body, id).toContain(report.bodyFamily);
          if (report.fontSheetsLoaded) {
            expect(report.webfontFaces, id).toContain(report.headingFamily);
            expect(report.headingLoaded, `${id} ${report.headingFamily}`).toBe(true);
          }
        }
      } finally {
        await r.page.close();
      }
    }, 150_000);
  }

  it('[P.4] the header\'s page_background, decoration_color and font_preset restyle a derived theme', async () => {
    const text = sampleText('beige-decent-1').replace('page_size: A4\n', 'page_size: A4\npage_background: "#ffffff"\ndecoration_color: "#0000ff"\nfont_preset: inter\n');
    const r = await renderPaged(browser!, text, { scale: 1 });
    try {
      const got = await r.page.evaluate(() => {
        const page = document.querySelector('.pagedjs_page')!;
        const doc = page.querySelector('.orz-doc')!;
        return {
          page: getComputedStyle(page).backgroundColor,
          link: getComputedStyle(doc.querySelector('a')!).color,
          body: getComputedStyle(doc.querySelector(':scope > p')!).fontFamily,
          heading: getComputedStyle(doc.querySelector('h1')!).fontFamily,
        };
      });
      expect(got.page).toBe('rgb(255, 255, 255)');
      expect(got.link).toBe('rgb(0, 0, 255)');
      expect(got.body).toMatch(/^"?Inter/);
      expect(got.heading).toMatch(/^"?Inter/);
    } finally {
      await r.page.close();
    }
  }, 90_000);
});

chrome('the table of contents in every theme (real Chrome)', () => {
  it('[P.10] the TOC the runtime fills is the structure the print layer styles — per heading up to max_level: text, dotted leader, page number right-aligned — so in every theme the number never runs into the entry; headings below max_level are not listed', async () => {
    const heads = Array.from({ length: 6 }, (_, i) => `## Section number ${i + 1} with a long enough title\n\nText of section ${i + 1}.\n\n### Subsection ${i + 1}.1\n\nMore text.\n`).join('\n');
    const report: string[] = [];
    for (const theme of THEMES) {
      for (const maxLevel of [2, 3]) {
        const text = `{{nyml\nkind: document\ntitle: Contents test\ntheme: ${theme}\n}}\n\n{{nyml\nkind: toc\ntitle: Contents\nmax_level: ${maxLevel}\n}}\n\n${heads}`;
        const r = await renderPaged(browser!, text, { scale: 1 });
        try {
          expect(r.errors, theme).toEqual([]);
          const items = await r.page.evaluate(() => Array.from(document.querySelectorAll('.orz-toc .orz-toc-item')).map((li) => {
            const q = (s: string) => li.querySelector(s) as HTMLElement | null;
            const t = q('.orz-toc-entry > .orz-toc-text')!.getBoundingClientRect();
            const leader = q('.orz-toc-entry > .orz-toc-leader')!;
            const l = leader.getBoundingClientRect();
            const n = q('.orz-toc-entry > .orz-toc-page')!;
            const nr = n.getBoundingClientRect();
            const entry = q('.orz-toc-entry')!.getBoundingClientRect();
            return { cls: li.className, text: q('.orz-toc-text')!.textContent, page: n.textContent, gap: nr.left - t.right, leader: l.width, dotted: getComputedStyle(leader).borderBottomStyle, flush: Math.abs(entry.right - nr.right), sameLine: Math.abs(nr.bottom - t.bottom) < t.height };
          }));
          const want = maxLevel === 2 ? 6 : 12;
          expect(items.length, `${theme} max_level ${maxLevel}`).toBe(want);
          expect(items.filter((i) => /orz-toc-l3/.test(i.cls)).length, `${theme} max_level ${maxLevel}: level-3 entries`).toBe(maxLevel === 2 ? 0 : 6);
          for (const i of items) {
            const id = `${theme} "${i.text}"`;
            expect(i.page, id).toMatch(/^\d+$/);
            expect(i.gap, `${id}: number ${i.gap.toFixed(1)} px after the text`).toBeGreaterThan(8);
            expect(i.leader, `${id}: the leader`).toBeGreaterThan(4);
            expect(i.dotted, id).toBe('dotted');
            expect(i.flush, `${id}: the number at the right edge`).toBeLessThan(1);
            expect(i.sameLine, id).toBe(true);
          }
          if (maxLevel === 2) report.push(`${theme}: min gap ${Math.min(...items.map((i) => i.gap)).toFixed(0)} px`);
        } finally {
          await r.page.close();
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('[P.10]', report.join('; '));
  }, 300_000);
});

/** A document with a long table (`rows` rows, the first cell `r<n>`) after an exam question and some text. */
function tableText(o: { pageSize: string; rows: number; repeat?: boolean; theme?: string }): string {
  const rows = Array.from({ length: o.rows }, (_, i) => `| r${i + 1} | value ${i + 1} | a note on row ${i + 1} |`).join('\n');
  return `{{nyml\nkind: document\ntitle: Long table\ntheme: ${o.theme ?? 'light-neat-1'}\npage_size: ${o.pageSize}\nheader_right: Long table\n${o.repeat === false ? 'repeat_table_header: false\n' : ''}}}\n\n# Long table\n\n{{nyml\nkind: question-open\nn: 1\npts: 2 pts\nbody: What does the table show?\n}}\n\nSome text before the table.\n\n| Key | Value | Note |\n|:--|--:|:--|\n${rows}\n\nText after the table.\n`;
}

/** Per page that holds a table fragment: its header row's text, the rows' first cells, and rows outside the page area. */
async function tableReport(page: import('playwright-core').Page) {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.pagedjs_page')).flatMap((pg, n) => {
    const area = pg.querySelector<HTMLElement>('.pagedjs_area')!.getBoundingClientRect();
    return Array.from(pg.querySelectorAll<HTMLTableElement>('table')).map((t) => {
      const head = Array.from(t.children).find((c) => c.tagName === 'THEAD') as HTMLElement | undefined;
      const first = Array.from(t.children).find((c) => c.tagName !== 'CAPTION' && c.tagName !== 'COLGROUP');
      const rows = Array.from(t.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr'));
      const r = head?.getBoundingClientRect();
      return {
        page: n + 1,
        split: t.hasAttribute('data-split-from'),
        head: head ? (head.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
        headFirst: !!head && first === head,
        headInside: !r || (r.top >= area.top - 0.5 && r.bottom <= area.bottom + 0.5),
        cells: rows.map((tr) => (tr.cells[0]?.textContent ?? '').trim()),
        clipped: rows.filter((tr) => { const b = tr.getBoundingClientRect(); return b.bottom > area.bottom + 0.5 || b.top < area.top - 0.5 || b.left >= area.right - 1; }).map((tr) => (tr.cells[0]?.textContent ?? '').trim()),
      };
    });
  }));
}

chrome('long tables and the page furniture (real Chrome)', () => {
  for (const pageSize of ['A5', 'A4']) {
    it(`[P.11] [T.23] a 90-row table on ${pageSize}: its header row on every page it spans (the first child of each fragment, inside the page area), all 90 rows exactly once and in order, none clipped below the page area; the exam question header reads "1. (2 pts)"`, async () => {
      const r = await renderPaged(browser!, tableText({ pageSize, rows: 90 }), { scale: 1 });
      try {
        expect(r.errors).toEqual([]);
        const frags = await tableReport(r.page);
        expect(frags.length, 'the table spans pages').toBeGreaterThanOrEqual(pageSize === 'A5' ? 4 : 2);
        for (const f of frags) {
          expect(f.head, `page ${f.page}`).toBe('Key Value Note');
          expect(f.headFirst, `page ${f.page}: the header first`).toBe(true);
          expect(f.headInside, `page ${f.page}: the header inside the page area`).toBe(true);
          expect(f.clipped, `page ${f.page}: rows outside the page area`).toEqual([]);
          expect(f.cells.length, `page ${f.page}: rows under the header`).toBeGreaterThan(0);
        }
        expect(frags.slice(1).every((f) => f.split)).toBe(true);
        expect(frags.flatMap((f) => f.cells)).toEqual(Array.from({ length: 90 }, (_, i) => `r${i + 1}`));
        // the header is a repeat, not a row: no header text among the rows; the text after the table is laid out
        expect(await r.page.evaluate(() => document.querySelectorAll('[data-orz-repeated-head]').length)).toBe(frags.length - 1);
        expect(await r.page.evaluate(() => Array.from(document.querySelectorAll('.markdown-body p')).some((p) => p.textContent === 'Text after the table.'))).toBe(true);
        expect(await r.page.evaluate(() => (document.querySelector('.orz-q-header') as HTMLElement).innerText)).toBe('1. (2 pts)');
      } finally {
        await r.page.close();
      }
    });
  }

  it('[P.11] repeat_table_header: false — the continuation pages carry no header row; every row still once', async () => {
    const r = await renderPaged(browser!, tableText({ pageSize: 'A5', rows: 90, repeat: false }), { scale: 1 });
    try {
      const frags = await tableReport(r.page);
      expect(frags.length).toBeGreaterThanOrEqual(4);
      expect(frags[0]!.head).toBe('Key Value Note');
      for (const f of frags.slice(1)) expect(f.head, `page ${f.page}`).toBeNull();
      expect(frags.flatMap((f) => f.cells)).toEqual(Array.from({ length: 90 }, (_, i) => `r${i + 1}`));
    } finally {
      await r.page.close();
    }
  });

  it('[P.12] the page furniture takes the theme: the running header, footer and page number are set in the theme\'s body font (the font of its paragraphs) and its muted text colour — light-academic-1, light-playful-1, beige-decent-1 and none; screenshots in /tmp/paged-furniture', async () => {
    const dir = '/tmp/paged-furniture';
    mkdirSync(dir, { recursive: true });
    for (const theme of ['light-academic-1', 'light-playful-1', 'beige-decent-1', 'none']) {
      const text = `{{nyml\nkind: document\ntitle: Furniture\ntheme: ${theme}\npage_size: A5\nheader_left: A running header\nheader_right: Furniture\nfooter_left: orz-paged\npage_number_position: footer-right\npage_number_style: page-n-of-N\n}}\n\n# Furniture\n\n${'A paragraph of body text set in the theme\'s body font. '.repeat(40)}\n\n${'Another paragraph on the next page. '.repeat(60)}\n`;
      const r = await renderPaged(browser!, text, { scale: 2 });
      try {
        expect(r.errors, theme).toEqual([]);
        const got = await r.page.evaluate(() => {
          const pg = document.querySelectorAll<HTMLElement>('.pagedjs_page')[1]!;
          const probe = document.createElement('span');
          probe.style.cssText = 'color: var(--text-muted); font-family: var(--font-body)';
          pg.querySelector('.pagedjs_area')!.appendChild(probe);
          const muted = getComputedStyle(probe).color;
          probe.remove();
          const para = getComputedStyle(pg.querySelector('.markdown-body p')!);
          const box = (sel: string) => {
            const el = pg.querySelector<HTMLElement>(sel)!;
            const c = getComputedStyle(el.querySelector('.pagedjs_margin-content') ?? el, '::after');
            return { font: c.fontFamily, color: c.color, content: c.content };
          };
          return { para: para.fontFamily, paraColor: para.color, muted, boxes: { tl: box('.pagedjs_margin-top-left'), tr: box('.pagedjs_margin-top-right'), bl: box('.pagedjs_margin-bottom-left'), br: box('.pagedjs_margin-bottom-right') } };
        });
        for (const [k, b] of Object.entries(got.boxes)) {
          expect(b.content, `${theme} ${k}`).not.toBe('none');
          expect(b.font, `${theme} ${k}: the body font`).toBe(got.para);
          expect(b.color, `${theme} ${k}: the muted colour`).toBe(got.muted);
        }
        expect(got.muted, `${theme}: muted is not the body colour`).not.toBe(got.paraColor);
        const pg = r.page.locator('.pagedjs_page').nth(1);
        await pg.locator('.pagedjs_margin-top').screenshot({ path: `${dir}/${theme}-header.png` });
        await pg.locator('.pagedjs_margin-bottom').screenshot({ path: `${dir}/${theme}-footer.png` });
      } finally {
        await r.page.close();
      }
    }
  }, 120_000);
});
