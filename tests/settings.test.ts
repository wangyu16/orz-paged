import { describe, it, expect } from 'vitest';
import {
  DEFAULTS,
  parseDocSettings,
  normalizeRawToLayer,
  mergeSettings,
} from '../src/doc/settings.js';

describe('DEFAULTS', () => {
  it('uses the documented defaults', () => {
    expect(DEFAULTS.pageSize).toBe('A4');
    expect(DEFAULTS.marginTop).toBe(20);
    expect(DEFAULTS.marginBottom).toBe(20);
    expect(DEFAULTS.marginLeft).toBe(20);
    expect(DEFAULTS.marginRight).toBe(20);
    // fontPreset / decorationColor are intentionally unset by default so a
    // theme's own font + accent apply unless explicitly overridden.
    expect(DEFAULTS.fontPreset).toBeUndefined();
    expect(DEFAULTS.fontSize).toBe(12);
    expect(DEFAULTS.lineHeight).toBe(1.5);
    expect(DEFAULTS.decorationColor).toBeUndefined();
    expect(DEFAULTS.pageNumberPosition).toBe('footer-center');
    expect(DEFAULTS.pageNumberStyle).toBe('simple');
    expect(DEFAULTS.pageNumberStartPage).toBe(1);
    expect(DEFAULTS.firstPageSkipNumber).toBe(false);
    expect(DEFAULTS.headerLeft).toBe('');
    expect(DEFAULTS.headerCenter).toBe('');
    expect(DEFAULTS.headerRight).toBe('');
    expect(DEFAULTS.headerRule).toBe(true);
    expect(DEFAULTS.headerFontSize).toBe(9);
    expect(DEFAULTS.footerRule).toBe(true);
    expect(DEFAULTS.footerFontSize).toBe(9);
    expect(DEFAULTS.firstPageHideHeader).toBe(false);
    expect(DEFAULTS.firstPageHideFooter).toBe(false);
    expect(DEFAULTS.limitImageToPage).toBe(true);
    expect(DEFAULTS.keepImageTogether).toBe(true);
    expect(DEFAULTS.repeatTableHeader).toBe(true);
    expect(DEFAULTS.avoidTableRowBreaks).toBe(true);
    expect(DEFAULTS.theme).toBe('light-academic-1');
  });
});

describe('parseDocSettings', () => {
  it('returns empty raw and unchanged body when no document block', () => {
    const src = '# Hello\n\nSome content.';
    const { raw, body } = parseDocSettings(src);
    expect(raw).toEqual({});
    expect(body).toBe(src);
  });

  it('parses a document block and strips it from the body', () => {
    const src = [
      '{{nyml',
      'kind: document',
      'page_size: letter',
      'font_size: 11',
      '}}',
      '',
      '# Title',
      '',
      'Body text.',
    ].join('\n');

    const { raw, body } = parseDocSettings(src);
    expect(raw.page_size).toBe('letter');
    expect(raw.font_size).toBe('11');
    expect(raw.kind).toBeUndefined(); // kind line is skipped
    expect(body).not.toContain('{{nyml');
    expect(body).not.toContain('kind: document');
    expect(body).toContain('# Title');
    expect(body).toContain('Body text.');
  });

  it('ignores a non-document nyml block', () => {
    const src = [
      '{{nyml',
      'kind: element',
      'title: Hi',
      '}}',
      '',
      'content',
    ].join('\n');
    const { raw, body } = parseDocSettings(src);
    expect(raw).toEqual({});
    expect(body).toBe(src);
  });

  it('finds the document block even when a non-document block precedes it', () => {
    const src = [
      '{{nyml',
      'kind: element',
      'title: Hi',
      '}}',
      '',
      '{{nyml',
      'kind: document',
      'theme: light-neat-1',
      '}}',
      '',
      'body',
    ].join('\n');
    const { raw, body } = parseDocSettings(src);
    expect(raw.theme).toBe('light-neat-1');
    // the element block survives, the document block is removed
    expect(body).toContain('kind: element');
    expect(body).not.toContain('kind: document');
  });

  it('parses a `|` multiline block as the field value', () => {
    const src = [
      '{{nyml',
      'kind: document',
      'custom_css: |',
      '  .foo { color: red; }',
      '  .bar { color: blue; }',
      'font_size: 14',
      '}}',
      '',
      'body',
    ].join('\n');

    const { raw } = parseDocSettings(src);
    expect(raw.custom_css).toBe('.foo { color: red; }\n.bar { color: blue; }');
    expect(raw.font_size).toBe('14');
  });

  it('strips surrounding quotes from scalar values', () => {
    const src = [
      '{{nyml',
      'kind: document',
      'decoration_color: "#2962a4"',
      '}}',
      'body',
    ].join('\n');
    const { raw } = parseDocSettings(src);
    expect(raw.decoration_color).toBe('#2962a4');
  });
});

describe('normalizeRawToLayer', () => {
  it('normalizes page_size aliases case-insensitively', () => {
    expect(normalizeRawToLayer({ page_size: 'a4' }).pageSize).toBe('A4');
    expect(normalizeRawToLayer({ page_size: 'A4' }).pageSize).toBe('A4');
    expect(normalizeRawToLayer({ page_size: 'letter' }).pageSize).toBe('Letter');
    expect(normalizeRawToLayer({ page_size: 'LEGAL' }).pageSize).toBe('Legal');
    expect(normalizeRawToLayer({ page_size: 'a5' }).pageSize).toBe('A5');
  });

  it('passes through a custom CSS page-size string', () => {
    expect(normalizeRawToLayer({ page_size: '210mm 297mm' }).pageSize).toBe(
      '210mm 297mm',
    );
  });

  it('coerces numeric fields', () => {
    const layer = normalizeRawToLayer({
      margin_top: '15',
      font_size: '11',
      line_height: '1.4',
      page_number_start_page: '3',
    });
    expect(layer.marginTop).toBe(15);
    expect(layer.fontSize).toBe(11);
    expect(layer.lineHeight).toBe(1.4);
    expect(layer.pageNumberStartPage).toBe(3);
  });

  it('coerces boolean fields', () => {
    expect(normalizeRawToLayer({ header_rule: 'false' }).headerRule).toBe(false);
    expect(normalizeRawToLayer({ header_rule: 'true' }).headerRule).toBe(true);
    expect(
      normalizeRawToLayer({ first_page_skip_number: 'yes' }).firstPageSkipNumber,
    ).toBe(true);
    expect(
      normalizeRawToLayer({ avoid_table_row_breaks: 'no' }).avoidTableRowBreaks,
    ).toBe(false);
  });

  it('maps snake_case keys to camelCase string fields', () => {
    const layer = normalizeRawToLayer({
      header_left: 'Left',
      footer_center: 'Page',
      decoration_color: '#123456',
      custom_css: '.x{}',
      template: 'report',
      theme: 'light-neat-1',
    });
    expect(layer.headerLeft).toBe('Left');
    expect(layer.footerCenter).toBe('Page');
    expect(layer.decorationColor).toBe('#123456');
    expect(layer.customCss).toBe('.x{}');
    expect(layer.template).toBe('report');
    expect(layer.theme).toBe('light-neat-1');
  });

  it('only includes keys present in the raw and ignores unknown keys', () => {
    const layer = normalizeRawToLayer({ font_size: '14', made_up_key: 'x' });
    expect(layer.fontSize).toBe(14);
    expect(Object.keys(layer)).toEqual(['fontSize']);
  });

  it('front_matter accepts clean/plain/booleans', () => {
    expect(normalizeRawToLayer({ front_matter: 'clean' }).frontMatterClean).toBe(true);
    expect(normalizeRawToLayer({ front_matter: 'plain' }).frontMatterClean).toBe(true);
    expect(normalizeRawToLayer({ front_matter_clean: true }).frontMatterClean).toBe(true);
    expect(normalizeRawToLayer({ front_matter: 'normal' }).frontMatterClean).toBe(false);
  });
});

describe('mergeSettings', () => {
  it('fills every field from DEFAULTS', () => {
    const merged = mergeSettings(DEFAULTS);
    expect(merged).toEqual(DEFAULTS);
  });

  it('lets a later layer win', () => {
    const merged = mergeSettings(
      DEFAULTS,
      { pageSize: 'Letter', fontSize: 13 },
      { fontSize: 11 },
    );
    expect(merged.pageSize).toBe('Letter');
    expect(merged.fontSize).toBe(11); // user layer (last) wins
    expect(merged.lineHeight).toBe(1.5); // untouched default remains
  });

  it('skips undefined values in layers', () => {
    const merged = mergeSettings(DEFAULTS, { fontSize: undefined });
    expect(merged.fontSize).toBe(DEFAULTS.fontSize);
  });

  it('works end-to-end: parse → normalize → merge', () => {
    const src = [
      '{{nyml',
      'kind: document',
      'page_size: letter',
      'font_size: 11',
      'header_rule: false',
      '}}',
      'body',
    ].join('\n');
    const { raw } = parseDocSettings(src);
    const merged = mergeSettings(DEFAULTS, normalizeRawToLayer(raw));
    expect(merged.pageSize).toBe('Letter');
    expect(merged.fontSize).toBe(11);
    expect(merged.headerRule).toBe(false);
    expect(merged.theme).toBe('light-academic-1'); // default preserved
  });
});
