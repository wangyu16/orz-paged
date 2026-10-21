/**
 * Rebuild step 1 — the base: orz-markdown (^, at least release.config.json
 * kit.required) without shims, one theme list, the version constant, no
 * copied escape helpers, the test setup (claims B.1–B.5). The kit's range is
 * read from package.json and its floor from release.config.json, never
 * written here (D-117: a kit bump must not fail the fast lane on a literal).
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
/** The kit floor the code needs (release.config.json `kit.required`), and whether a `^X.Y.Z` range meets it (same major, X.Y.Z ≥ it). */
const KIT = (JSON.parse(readFileSync('release.config.json', 'utf8')) as { kit: { name: string; required: string } }).kit;
const v3 = (v: string): number[] => v.split('.').map(Number);
const meetsFloor = (range: string, floor: string): boolean => {
  const m = /^\^(\d+\.\d+\.\d+)$/.exec(range);
  if (!m) return false;
  const [a, b] = [v3(m[1] as string), v3(floor)];
  return a[0] === b[0] && (a[1]! > b[1]! || (a[1] === b[1] && a[2]! >= b[2]!));
};

describe('base', () => {
  it('[B.1] depends on orz-markdown ^X.Y.Z at least the kit the code needs (release.config.json kit.required) and pagedjs 0.4.3 with no shims, aliases, injected globals or package.json walk', async () => {
    expect(KIT.name).toBe('orz-markdown');
    expect(KIT.required).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies['orz-markdown'], `^X.Y.Z at least ${KIT.required}`).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(meetsFloor(pkg.dependencies['orz-markdown'] as string, KIT.required), `${pkg.dependencies['orz-markdown']} meets ${KIT.required}`).toBe(true);
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

  it('[B.5] the test setup is orz-mdhtml\'s: vitest projects (main, chrome — one file at a time —, conformance), playwright-core for real Chrome, a live claims registry', () => {
    expect(pkg.devDependencies).toHaveProperty('playwright-core');
    expect(pkg.devDependencies).toHaveProperty('vitest');
    const config = readFileSync('vitest.config.ts', 'utf8');
    expect(config).toMatch(/name: 'main'/);
    expect(config).toMatch(/name: 'conformance'/);
    // every file that launches Chrome runs in the serial lane
    expect(config).toMatch(/name: 'chrome', include: CHROME, fileParallelism: false/);
    for (const f of readdirSync('tests').filter((x) => x.endsWith('.test.ts') && x !== 'conformance.test.ts')) {
      if (/\b(launch|launchChrome)\(\)/.test(readFileSync(`tests/${f}`, 'utf8'))) expect(config, f).toContain(`'tests/${f}'`);
    }
    expect(existsSync('notes/CLAIMS.md')).toBe(true);
    expect(existsSync('tests/claims.test.ts')).toBe(true);
    expect(readFileSync('tsconfig.json', 'utf8')).toMatch(/"tests"/);
  });

  it('[B.6] both prepublishOnlys run the family release gate and the stamp check, never the suite; the tiers are scripts; the tooling is not shipped; the installed kit passes the gate (family Phase 4)', async () => {
    const p = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string>; files: string[] };
    expect(p.scripts['prepublishOnly']).toBe('npm run build && tsx scripts/release-check.ts --after-build && tsx scripts/test-release.ts --check');
    expect(p.scripts['release:check']).toBe('tsx scripts/release-check.ts');
    expect(p.scripts['test:release']).toBe('tsx scripts/test-release.ts');
    expect(p.scripts['test:fast']).toBe('tsx scripts/test-release.ts --fast');
    expect(p.scripts['test:changed']).toBe('tsx scripts/test-release.ts --changed');
    const browser = JSON.parse(readFileSync('browser/package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(browser.scripts['prepublishOnly']).toBe('node scripts/check-release.mjs && cd .. && npx tsx scripts/release-check.ts && npx tsx scripts/test-release.ts --check');
    expect(readFileSync('.gitignore', 'utf8').split('\n')).toContain('.release/');
    for (const f of p.files) expect(f, 'the release tooling is never shipped').not.toMatch(/^(scripts|\.release|release\.config\.json)/);
    const { loadConfig, releaseProblems, releaseState } = await import('../scripts/release-check.js');
    const config = loadConfig(process.cwd());
    expect(config.kit).toEqual(KIT);
    expect(config.checks).toEqual([['node', 'browser/scripts/check-release.mjs']]);
    expect(releaseProblems(releaseState(process.cwd(), config), config).filter((x) => /orz-markdown/.test(x))).toEqual([]);
    // the column matrix: full when column code changed since the last green run, else a fixed 40-case sample
    expect(config['extra']).toEqual([{ name: 'columns-matrix', full: ['npx', 'tsx', 'scripts/columns-matrix.ts'], sample: ['npx', 'tsx', 'scripts/columns-matrix.ts', '--sample', '40'], fullWhen: ['src/paged/', 'tests/integrity.ts', 'tests/fixtures/columns/', 'scripts/columns-matrix.ts', 'assets/themes/', 'assets/templates/', 'package-lock.json'] }]);
    expect(readFileSync('scripts/columns-matrix.ts', 'utf8')).toMatch(/Math\.floor\(\(i \* all\.length\) \/ sample\)/);
  });
});
