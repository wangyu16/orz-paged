/**
 * Rebuild step 1 — the base: orz-markdown ^2.3.0 without shims, one theme
 * list, the version constant, no copied escape helpers, the test setup
 * (claims B.1–B.5).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { THEMES, DEFAULT_THEME, isThemeId } from '../src/themes.js';
import { THEME_FONTS } from '../src/doc/theme-fonts.js';
import { VERSION } from '../src/version.js';
import { buildBrowser } from '../build/bundle.js';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; dependencies: Record<string, string>; devDependencies: Record<string, string> };
const sources = (dir: string): string[] =>
  (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(ts|js|cjs|mjs)$/.test(f)).map((f) => `${dir}/${f}`);

describe('base', () => {
  it('[B.1] depends on orz-markdown ^2.3.0 and pagedjs 0.4.3 with no shims, aliases, injected globals or package.json walk', async () => {
    expect(pkg.dependencies['orz-markdown']).toBe('^2.3.0');
    expect(pkg.dependencies['pagedjs']).toBe('0.4.3'); // pinned exactly: the two-column handler is tested against it
    expect(existsSync('build/shims')).toBe(false);
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty('path-browserify');
    for (const file of [...sources('src'), ...sources('build')]) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/path-browserify|build\/shims|shims\/|inject\s*:|alias\s*:|__ORZPAGED_VERSION__/);
      expect(src, file).not.toMatch(/require\.resolve\(['"]orz-markdown|orzPackageJson|walking up|join\(ROOT, 'package\.json'\)/);
    }
    expect(readFileSync('src/lib.ts', 'utf8')).toMatch(/from 'orz-markdown\/version'/);
    expect(readFileSync('build/bundle.ts', 'utf8')).toMatch(/from 'orz-markdown\/version'/);
    // the engine bundles for the browser as it is, and needs no Node module at run time
    const code = (await buildBrowser()).iife;
    expect(code).not.toMatch(/require\("(fs|path|os|crypto|url|module)"\)/);
    expect(code.length).toBeGreaterThan(100_000);
  }, 60_000);

  it('[B.2] one theme list (src/themes.ts): the stylesheets in assets/themes plus `none`, each with its fonts; the default is one of them', () => {
    const shipped = readdirSync('assets/themes').filter((f) => f.endsWith('.css') && f !== 'base.css').map((f) => f.slice(0, -4));
    expect([...THEMES].sort()).toEqual([...shipped, 'none'].sort());
    expect([...THEMES].sort()).toEqual(Object.keys(THEME_FONTS).sort());
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    expect(isThemeId('dark-elegant-1')).toBe(false);
  });

  it('[B.3] VERSION is the package version', () => {
    expect(VERSION).toBe(pkg.version);
    expect(readFileSync('src/version.ts', 'utf8')).toContain(`export const VERSION = ${JSON.stringify(pkg.version)};`);
  });

  it('[B.4] no copied escape helpers: TypeScript sources use the kit\'s (orz-markdown/carrier/read)', () => {
    for (const file of sources('src')) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/function (escapeHtml|escapeAttr|escapeHTML|esc)\s*\(/);
      expect(src, file).not.toMatch(/\.replace\(\/&\/g, ['"]&amp;['"]\)/);
    }
    expect(readFileSync('src/doc/elements.ts', 'utf8')).toMatch(/from 'orz-markdown\/carrier\/read'/);
  });

  it('[B.5] the test setup is orz-mdhtml\'s: vitest projects (main, conformance), playwright-core for real Chrome, a live claims registry', () => {
    expect(pkg.devDependencies).toHaveProperty('playwright-core');
    expect(pkg.devDependencies).toHaveProperty('vitest');
    const config = readFileSync('vitest.config.ts', 'utf8');
    expect(config).toMatch(/name: 'main'/);
    expect(config).toMatch(/name: 'conformance'/);
    expect(existsSync('notes/CLAIMS.md')).toBe(true);
    expect(existsSync('tests/claims.test.ts')).toBe(true);
    expect(readFileSync('tsconfig.json', 'utf8')).toMatch(/"tests"/);
  });
});
