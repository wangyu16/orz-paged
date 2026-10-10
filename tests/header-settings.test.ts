/**
 * The FC-18 header is THE settings source (claims S.1–S.4): every paged key of
 * the kit's registry keeps its 0.x meaning, layered defaults ← template ←
 * header; the renderer reads nothing else.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { KIND_HEADER_KEYS, readHeader } from 'orz-markdown/carrier';
import { DEFAULTS, normalizeRawToLayer, readSettings, resolveSettings } from '../src/doc/settings.js';
import { resolveTemplate } from '../src/doc/templates.js';
import { renderDocument } from '../src/render-paged.js';
import { corpus } from './helpers.js';

/** A sample value per key, and the settings field it sets (0.x meaning). */
const SAMPLES: Record<string, [string, string, unknown]> = {
  template: ['report', 'template', 'report'],
  page_size: ['letter', 'pageSize', 'Letter'],
  margin_top: ['11', 'marginTop', 11],
  margin_bottom: ['12', 'marginBottom', 12],
  margin_left: ['13', 'marginLeft', 13],
  margin_right: ['14', 'marginRight', 14],
  page_background: ['#fffdf8', 'pageBackground', '#fffdf8'],
  font_preset: ['lora', 'fontPreset', 'lora'],
  font_family: ['Georgia, serif', 'fontFamily', 'Georgia, serif'],
  font_heading_preset: ['inter', 'fontHeadingPreset', 'inter'],
  font_margin_box_preset: ['inter', 'fontMarginBoxPreset', 'inter'],
  font_size: ['10.5', 'fontSize', 10.5],
  line_height: ['1.3', 'lineHeight', 1.3],
  decoration_color: ['#123456', 'decorationColor', '#123456'],
  page_number_position: ['header-right', 'pageNumberPosition', 'header-right'],
  page_number_style: ['n-of-N', 'pageNumberStyle', 'n-of-N'],
  page_number_start_page: ['3', 'pageNumberStartPage', 3],
  first_page_skip_number: ['yes', 'firstPageSkipNumber', true],
  header_left: ['L', 'headerLeft', 'L'],
  header_center: ['C', 'headerCenter', 'C'],
  header_right: ['R', 'headerRight', 'R'],
  header_rule: ['false', 'headerRule', false],
  header_rule_color: ['#ccc', 'headerRuleColor', '#ccc'],
  header_font_size: ['8', 'headerFontSize', 8],
  footer_left: ['fl', 'footerLeft', 'fl'],
  footer_center: ['fc', 'footerCenter', 'fc'],
  footer_right: ['fr', 'footerRight', 'fr'],
  footer_rule: ['no', 'footerRule', false],
  footer_rule_color: ['#ddd', 'footerRuleColor', '#ddd'],
  footer_font_size: ['7', 'footerFontSize', 7],
  first_page_hide_header: ['true', 'firstPageHideHeader', true],
  first_page_hide_footer: ['on', 'firstPageHideFooter', true],
  front_matter: ['clean', 'frontMatterClean', true],
  front_matter_clean: ['true', 'frontMatterClean', true],
  limit_image_to_page: ['false', 'limitImageToPage', false],
  keep_image_together: ['false', 'keepImageTogether', false],
  repeat_table_header: ['false', 'repeatTableHeader', false],
  avoid_table_row_breaks: ['false', 'avoidTableRowBreaks', false],
  custom_css: ['.a { color: red; }\n.b { x: y }', 'customCss', '.a { color: red; }\n.b { x: y }'],
  dynamic_choices: ['answer-key: show\nAudience: Student', 'dynamicChoices', { answer_key: 'show', audience: 'Student' }],
  theme: ['light-neat-2', 'theme', 'light-neat-2'],
};

const headerOf = (key: string, value: string): string =>
  value.includes('\n') ? `{{nyml\nkind: document\n${key}: |\n${value.split('\n').map((l) => `  ${l}`).join('\n')}\n}}\n\nbody\n` : `{{nyml\nkind: document\n${key}: ${value}\n}}\n\nbody\n`;

describe('the header is the settings source', () => {
  it('[S.3] every paged key of the kit registry (KIND_HEADER_KEYS.paged) and `theme` is read from the header with its 0.x meaning', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...KIND_HEADER_KEYS.paged, 'theme'].sort());
    for (const [key, [value, field, expected]] of Object.entries(SAMPLES)) {
      const text = headerOf(key, value);
      const raw = readSettings(text).raw;
      expect(raw[key], key).toBe(value);
      expect((normalizeRawToLayer(raw) as Record<string, unknown>)[field], key).toEqual(expected);
      expect((resolveSettings(text) as unknown as Record<string, unknown>)[field], key).toEqual(expected);
    }
  });

  it('[S.3] the normalizer knows no key outside the registry (no private key list)', () => {
    const src = readFileSync('src/doc/settings.ts', 'utf8');
    const cases = [...src.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]);
    expect(cases.length).toBeGreaterThan(30);
    for (const k of cases) expect([...KIND_HEADER_KEYS.paged, 'theme'], k).toContain(k);
    expect(src).not.toMatch(/function parseDocSettings|function parseNymlBody|function findClosing/);
  });

  it('[S.1] layering: DEFAULTS ← the template\'s layout layer ← the header', () => {
    const tpl = '{{nyml\nkind: document\ntemplate: report-page\n}}\n\nbody\n';
    expect(resolveSettings(tpl).pageSize).toBe(resolveTemplate('report-page').pageSize);
    expect(resolveSettings(tpl).pageSize).not.toBe(DEFAULTS.pageSize);
    expect(resolveSettings('{{nyml\nkind: document\ntemplate: report-page\npage_size: A5\n}}\n').pageSize).toBe('A5');
    expect(resolveSettings('# no header\n')).toEqual(DEFAULTS);
    // a legacy kind: meta header carries no settings but is read as the kit reads it
    expect(resolveSettings('{{nyml\nkind: meta\ntitle: T\n}}\n\nx\n')).toEqual(DEFAULTS);
  });

  it('[S.4] the renderer reads the header: corpus documents render with their header settings and without the header text', () => {
    for (const c of corpus('paged')) {
      const a = renderDocument(c.text);
      const h = readHeader(c.text)!;
      expect(a.settings, c.path).toEqual(resolveSettings(c.text));
      if (h.fields['page_size']) expect(a.settings.pageSize.toLowerCase(), c.path).toBe(h.fields['page_size']!.toLowerCase());
      expect(a.bodyHtml, c.path).not.toContain('kind: document');
      expect(a.bodyHtml, c.path).not.toContain('{{nyml');
    }
    const el = renderDocument(corpus('paged').find((c) => c.path === 'paged/elements.paged.md')!.text);
    expect(el.settings).toMatchObject({ pageSize: 'Letter', marginTop: 22, marginLeft: 25, fontPreset: 'source-serif-4', decorationColor: '#2962a4', headerLeft: 'Department of Chemistry', firstPageHideHeader: true, theme: 'light-academic-2' });
    expect(el.css).toContain('size: Letter');
  });
});

describe('enumerated values', () => {
  it('[S.6] readDocument (Node and the browser engine\'s, one function) warns `invalid-value` on a value an enumerated paged key does not take — page_size, page_number_position, page_number_style, template, the font presets, front_matter — naming the key and its line; valid values, aliases, custom CSS sizes and every template and corpus header are clean', async () => {
    const { readDocument } = await import('../src/assemble.js');
    const { PAGE_NUMBER_POSITIONS, PAGE_NUMBER_STYLES, PAGE_SIZES } = await import('../src/browser/paged/settings.js');
    const { PAGE_NUMBER_POSITION_VALUES, PAGE_NUMBER_STYLE_VALUES, PAGE_SIZE_NAMES } = await import('../src/doc/lint.js');
    // the lint's lists are the pickers' lists
    expect([...PAGE_NUMBER_POSITION_VALUES]).toEqual(PAGE_NUMBER_POSITIONS.map((p) => p.value));
    expect([...PAGE_NUMBER_STYLE_VALUES]).toEqual(PAGE_NUMBER_STYLES.map((p) => p.value));
    expect([...PAGE_SIZE_NAMES]).toEqual(PAGE_SIZES.map((p) => p.value));
    const bad = '{{nyml\nkind: document\ntemplate: brochure\npage_size: B9\npage_number_style: roman\npage_number_position: middle\nfont_preset: comic\nfont_heading_preset: x\nfont_margin_box_preset: y\nfront_matter: maybe\n}}\n\nx';
    const lint = readDocument(bad).lint.filter((l) => l.code === 'invalid-value');
    expect(lint.map((l) => [l.key, l.line, l.level])).toEqual([
      ['template', 3, 'warning'], ['page_size', 4, 'warning'], ['page_number_style', 5, 'warning'], ['page_number_position', 6, 'warning'],
      ['font_preset', 7, 'warning'], ['font_heading_preset', 8, 'warning'], ['font_margin_box_preset', 9, 'warning'], ['front_matter', 10, 'warning'],
    ]);
    expect(lint[2]!.message).toMatch(/page_number_style: "roman" .*simple, page-n/);
    for (const ok of ['page_size: letter', 'page_size: A4 landscape', 'page_size: 6in 9in', 'page_size: 210mm 297mm', 'template: exam', 'page_number_style: page-n-of-N', 'front_matter: clean', 'front_matter: true', 'font_preset: lora']) {
      expect(readDocument(`{{nyml\nkind: document\n${ok}\n}}\n\nx`).lint, ok).toEqual([]);
    }
    // closed loop round 2 (mutants L4, L5): the CSS size is anchored at both ends; a key of Object.prototype is no template
    for (const bad of ['page_size: 210mm 297mm junk', 'page_size: 210mm 297mm 3mm', 'page_size: junk 210mm', 'page_size: A4 sideways', 'template: constructor', 'template: toString', 'template: __proto__', 'template: hasOwnProperty', 'front_matter: sometimes', 'front_matter_clean: maybe']) {
      const key = bad.slice(0, bad.indexOf(':'));
      expect(readDocument(`{{nyml\nkind: document\n${bad}\n}}\n\nx`).lint.map((l) => [l.code, l.key]), bad).toEqual([['invalid-value', key]]);
    }
    // front_matter takes what the settings reader reads: clean / plain / normal and the boolean words (`yes` is clean, as in 0.x)
    for (const ok of ['front_matter: normal', 'front_matter: yes', 'front_matter: no', 'front_matter: Plain', 'front_matter_clean: on']) {
      expect(readDocument(`{{nyml\nkind: document\n${ok}\n}}\n\nx`).lint, ok).toEqual([]);
    }
    // owner decision (round 3): the yes-words stay synonyms of `clean` — accepted, unflagged, and clean
    for (const w of ['clean', 'plain', 'yes', 'Yes', 'true', 'on', '1']) {
      const t = `{{nyml\nkind: document\nfront_matter: ${w}\n}}\n\nx`;
      expect(readDocument(t).lint, w).toEqual([]);
      expect(resolveSettings(t).frontMatterClean, w).toBe(true);
    }
    for (const w of ['normal', 'no', 'false', 'off', '0']) expect(resolveSettings(`{{nyml\nkind: document\nfront_matter: ${w}\n}}\n\nx`).frontMatterClean, w).toBe(false);
    for (const t of Object.values((await import('./helpers.js')).TEMPLATE_TEXTS)) expect(readDocument(t).lint.filter((l) => l.code === 'invalid-value')).toEqual([]);
    for (const c of corpus('paged')) expect(readDocument(c.text).lint.filter((l) => l.code === 'invalid-value'), c.path).toEqual([]);
  });
});
