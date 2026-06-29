import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  resolveTemplate,
  canonicalTemplate,
  templateSkeletonName,
  templateList,
} from '../src/doc/templates.js';
import { DEFAULTS, mergeSettings } from '../src/doc/settings.js';
import type { TemplateName } from '../src/types.js';

const ALL: TemplateName[] = [
  'article-page', 'article-section',
  'report-page', 'report-section',
  'exam-page', 'exam-section',
  'letter', 'cover-letter', 'cv', 'note',
];

describe('TEMPLATES', () => {
  it('defines all 10 curated templates', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual([...ALL].sort());
  });

  it('every template stamps its own name + has picker metadata + a skeleton stem', () => {
    for (const name of ALL) {
      expect(TEMPLATES[name].settings.template).toBe(name);
      expect(TEMPLATES[name].label.length).toBeGreaterThan(0);
      expect(TEMPLATES[name].group.length).toBeGreaterThan(0);
      expect(TEMPLATES[name].skeleton).toBe(name);
    }
  });

  it('article variants: Letter · serif · light-academic-1', () => {
    for (const v of ['article-page', 'article-section'] as TemplateName[]) {
      expect(TEMPLATES[v].settings.pageSize).toBe('Letter');
      expect(TEMPLATES[v].settings.fontPreset).toBe('system-serif');
      expect(TEMPLATES[v].settings.theme).toBe('light-academic-1');
    }
  });

  it('report variants: Letter · sans (inter) · light-neat-1', () => {
    for (const v of ['report-page', 'report-section'] as TemplateName[]) {
      expect(TEMPLATES[v].settings.pageSize).toBe('Letter');
      expect(TEMPLATES[v].settings.fontPreset).toBe('inter');
      expect(TEMPLATES[v].settings.theme).toBe('light-neat-1');
    }
  });

  it('letter: Letter · serif; cv: Letter · sans; note: A4 · serif', () => {
    expect(TEMPLATES.letter.settings.fontPreset).toBe('source-serif-4');
    expect(TEMPLATES.cv.settings.fontPreset).toBe('ibm-plex-sans');
    expect(TEMPLATES.note.settings.pageSize).toBe('A4');
    expect(TEMPLATES.note.settings.fontPreset).toBe('lora');
  });
});

describe('canonicalTemplate / legacy aliases', () => {
  it('passes canonical names through', () => {
    expect(canonicalTemplate('exam-page')).toBe('exam-page');
  });
  it('maps legacy article/report/exam to the -section variant', () => {
    expect(canonicalTemplate('article')).toBe('article-section');
    expect(canonicalTemplate('report')).toBe('report-section');
    expect(canonicalTemplate('exam')).toBe('exam-section');
  });
  it('returns undefined for an unknown name', () => {
    expect(canonicalTemplate('nope')).toBeUndefined();
  });
});

describe('resolveTemplate', () => {
  it('returns the settings layer for a known name', () => {
    expect(resolveTemplate('article-page')).toBe(TEMPLATES['article-page'].settings);
  });

  it('resolves a legacy name to its -section settings', () => {
    expect(resolveTemplate('article')).toBe(TEMPLATES['article-section'].settings);
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

describe('templateSkeletonName / templateList', () => {
  it('returns the skeleton stem for canonical + legacy names', () => {
    expect(templateSkeletonName('cv')).toBe('cv');
    expect(templateSkeletonName('exam')).toBe('exam-section');
  });
  it('lists all 10 with id/label/group/skeleton', () => {
    const list = templateList();
    expect(list).toHaveLength(10);
    for (const e of list) {
      expect(e.id).toBeTruthy();
      expect(e.label).toBeTruthy();
      expect(e.group).toBeTruthy();
      expect(e.skeleton).toBeTruthy();
    }
  });
});
