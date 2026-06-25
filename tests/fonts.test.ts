import { describe, it, expect } from 'vitest';
import { FONT_PRESETS, fontPreset } from '../src/doc/fonts.js';
import type { FontPresetName } from '../src/types.js';

const NON_SYSTEM: FontPresetName[] = [
  'source-serif-4',
  'lora',
  'crimson-pro',
  'noto-serif',
  'inter',
  'ibm-plex-sans',
  'roboto',
  'raleway',
  'noto-sans',
  'courier-prime',
];

describe('FONT_PRESETS', () => {
  it('covers every curated preset name', () => {
    const names = Object.keys(FONT_PRESETS).sort();
    expect(names).toEqual(
      [
        'system-serif',
        ...NON_SYSTEM,
      ].sort(),
    );
  });

  it.each(NON_SYSTEM)(
    '%s → non-empty https CDN url + non-empty family',
    (name) => {
      const preset = FONT_PRESETS[name];
      expect(preset.cssUrl).toMatch(/^https:\/\//);
      expect(preset.cssUrl).toContain('cdn.jsdelivr.net');
      expect(preset.cssUrl).toContain('@fontsource/');
      expect(preset.family.length).toBeGreaterThan(0);
    },
  );

  it('system-serif has no webfont (empty cssUrl) but a real family', () => {
    expect(FONT_PRESETS['system-serif'].cssUrl).toBe('');
    expect(FONT_PRESETS['system-serif'].family).toMatch(/serif/i);
  });

  it('each family is a quoted/keyworded CSS stack ending in a generic', () => {
    for (const name of NON_SYSTEM) {
      const { family } = FONT_PRESETS[name];
      expect(family).toMatch(/(serif|sans-serif|monospace)\s*$/);
    }
  });
});

describe('fontPreset()', () => {
  it('returns the matching preset for a known name', () => {
    expect(fontPreset('lora')).toBe(FONT_PRESETS.lora);
    expect(fontPreset('lora').cssUrl).toContain('@fontsource/lora@5');
  });

  it('falls back to a system (empty cssUrl) preset for unknown names', () => {
    const p = fontPreset('totally-not-a-font');
    expect(p.cssUrl).toBe('');
    expect(p.family.length).toBeGreaterThan(0);
  });

  it('system-serif resolves to an empty cssUrl', () => {
    expect(fontPreset('system-serif').cssUrl).toBe('');
  });
});
