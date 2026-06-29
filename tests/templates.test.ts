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

  it('templates set LAYOUT only — page size, never font or theme', () => {
    for (const name of ALL) {
      const s = TEMPLATES[name].settings;
      expect(s.pageSize).toBeTruthy();              // layout
      expect(s.fontPreset).toBeUndefined();         // theme owns the font
      expect(s.fontHeadingPreset).toBeUndefined();
      expect(s.theme).toBeUndefined();              // theme owns the look
    }
  });

  it('page sizes: note is A4, the rest Letter', () => {
    expect(TEMPLATES.note.settings.pageSize).toBe('A4');
    for (const name of ALL.filter((n) => n !== 'note')) {
      expect(TEMPLATES[name].settings.pageSize).toBe('Letter');
    }
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
    expect(merged.template).toBe('note'); // template stamp survives
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
