import { describe, it, expect } from 'vitest';
import { TEMPLATES, resolveTemplate } from '../src/doc/templates.js';
import { DEFAULTS, mergeSettings } from '../src/doc/settings.js';
import type { TemplateName } from '../src/types.js';

const ALL: TemplateName[] = [
  'article',
  'report',
  'letter',
  'cv',
  'note',
  'exam',
];

describe('TEMPLATES', () => {
  it('defines all 6 curated templates', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual([...ALL].sort());
  });

  it('every template stamps its own name', () => {
    for (const name of ALL) {
      expect(TEMPLATES[name].template).toBe(name);
    }
  });

  it('article: Letter · serif · light-academic-1', () => {
    expect(TEMPLATES.article.pageSize).toBe('Letter');
    expect(TEMPLATES.article.fontPreset).toBe('system-serif');
    expect(TEMPLATES.article.theme).toBe('light-academic-1');
  });

  it('report: Letter · sans', () => {
    expect(TEMPLATES.report.pageSize).toBe('Letter');
    expect(TEMPLATES.report.fontPreset).toBe('inter');
  });

  it('letter: Letter · serif', () => {
    expect(TEMPLATES.letter.pageSize).toBe('Letter');
    expect(TEMPLATES.letter.fontPreset).toBe('source-serif-4');
  });

  it('cv: Letter · sans', () => {
    expect(TEMPLATES.cv.pageSize).toBe('Letter');
    expect(TEMPLATES.cv.fontPreset).toBe('ibm-plex-sans');
  });

  it('note: A4 · serif', () => {
    expect(TEMPLATES.note.pageSize).toBe('A4');
    expect(TEMPLATES.note.fontPreset).toBe('lora');
  });

  it('exam: Letter · serif', () => {
    expect(TEMPLATES.exam.pageSize).toBe('Letter');
    expect(TEMPLATES.exam.fontPreset).toBe('noto-serif');
  });
});

describe('resolveTemplate', () => {
  it('returns the template layer for a known name', () => {
    expect(resolveTemplate('article')).toBe(TEMPLATES.article);
  });

  it('returns {} for an unknown name', () => {
    expect(resolveTemplate('nope' as TemplateName)).toEqual({});
  });

  it('merges over DEFAULTS so a user layer can still override', () => {
    const merged = mergeSettings(
      DEFAULTS,
      resolveTemplate('note'),
      { pageSize: 'Letter' }, // user override beats the template's A4
    );
    expect(merged.pageSize).toBe('Letter');
    expect(merged.fontPreset).toBe('lora'); // template default survives
    expect(merged.lineHeight).toBe(1.5); // untouched default
  });
});
