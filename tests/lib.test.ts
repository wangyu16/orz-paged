/**
 * Rebuild step 5 — the Node library (claims L.1, L.2; orz-mdhtml 1.0's
 * tests/lib.test.ts for the paged kind): inline assembly with this release's
 * real browser bundle (the dist/ copy, verified against its release.json),
 * and the 1.0 package surface with the 0.x API and runtime gone.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract as kitExtract } from 'orz-markdown/carrier';
import * as lib from '../src/lib.js';
import { assemble as assembleWith, TEMPLATE_IDS } from '../src/assemble.js';
import { upgrade as upgradeWith } from '../src/legacy.js';
import { readEngine } from '../src/engine.js';
import { VERSION } from '../src/version.js';
import { bundle } from './browser-env.js';
import { corpus, HAZARDS, LEGACY_FILES, read, TEMPLATE_TEXTS } from './helpers.js';

const b = await bundle();
const tmp = mkdtempSync(join(tmpdir(), 'orz-paged-lib-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('the Node library', () => {
  it('[L.1] inline assembly carries this release\'s bundle: the dist/ copy = orz-paged-browser\'s file = the build, verified against release.json; assemble and upgrade need no engine', () => {
    const engine = lib.engineFiles();
    expect(engine.bundle).toBe(join(process.cwd(), 'dist', 'orz-paged.browser.js'));
    expect(engine.source === b.iife).toBe(true);
    expect(engine.source === readFileSync('browser/orz-paged.browser.js', 'utf8')).toBe(true);
    expect(readFileSync(engine.release, 'utf8')).toBe(b.release);
    expect(readFileSync('browser/release.json', 'utf8')).toBe(b.release);
    expect(engine.integrity).toBe(b.integrity);
    expect(lib.engineSource() === b.iife).toBe(true);

    const SOME = { './part.md': 'Included </script> text\r\n', 'https://example.test/x.md': '# x\n' };
    for (const c of [...corpus('paged').slice(0, 6).map((x) => x.text), ...Object.values(TEMPLATE_TEXTS).slice(0, 3), ...Object.values(HAZARDS)]) {
      const inline = lib.assemble(c);
      expect(inline === assembleWith(c, { engineSource: b.iife })).toBe(true);
      expect(inline.split(b.iife).length - 1).toBe(1);
      expect(lib.assemble(c, { includes: SOME }) === assembleWith(c, { engineSource: b.iife, includes: SOME })).toBe(true);
      expect(lib.assemble(c, { delivery: 'cdn' })).toBe(assembleWith(c, { delivery: 'cdn' }));
      expect(lib.extract(inline)!.text === c).toBe(true);
    }
    // an explicit engine still wins (the conformance harness passes next's)
    expect(lib.assemble('# x\n', { engineSource: 'window.x=1;' })).toBe(assembleWith('# x\n', { engineSource: 'window.x=1;' }));
    for (const path of Object.values(LEGACY_FILES)) {
      const r = lib.upgrade(read(path), { uid: 'doc-libupgrade000001' });
      expect(r.html === upgradeWith(read(path), { uid: 'doc-libupgrade000001', engineSource: b.iife }).html).toBe(true);
      expect(kitExtract(r.html)!.delivery).toBe('inline');
    }
    // inspect checks an inline file of this version against this engine
    expect(lib.inspect(lib.assemble('# x\n')).checks!.engine).toBe('same');
    expect(lib.inspect(assembleWith('# x\n', { engineSource: 'window.x=1;' })).checks!.engine).toBe('different');

    // refused, never inlined: missing, stale (another version), altered, not script-safe
    const dir = (name: string): string => { const d = join(tmp, name); mkdirSync(d, { recursive: true }); cpSync(engine.bundle, join(d, 'orz-paged.browser.js')); cpSync(engine.release, join(d, 'release.json')); return d; };
    expect(() => readEngine([join(tmp, 'none')])).toThrow(/missing.*npm run bundle/);
    expect(readEngine([dir('good')]).source === b.iife).toBe(true);
    expect(() => readEngine([dir('stale')], '9.9.9')).toThrow(/not this release's 9\.9\.9/);
    const altered = dir('altered');
    writeFileSync(join(altered, 'orz-paged.browser.js'), `${b.iife};`, 'utf8');
    expect(() => readEngine([altered])).toThrow(/integrity/);
    const unsafe = dir('unsafe');
    const bad = `${b.iife}"</script>";`;
    writeFileSync(join(unsafe, 'orz-paged.browser.js'), bad, 'utf8');
    const m = JSON.parse(b.release) as { bundle: { integrity: string } };
    m.bundle.integrity = `sha384-${createHash('sha384').update(bad, 'utf8').digest('base64')}`;
    writeFileSync(join(unsafe, 'release.json'), JSON.stringify(m), 'utf8');
    expect(() => readEngine([unsafe])).toThrow(/script-safe/);
  }, 180_000);

  it('[L.2] the package is the 1.0 surface: the library exports the format-1 API only; the 0.x API and runtime are gone; bin, exports and files', () => {
    expect(Object.keys(lib).sort()).toEqual([
      'BUNDLE_FILE', 'DEFAULT_TEMPLATE', 'DEFAULT_THEME', 'FORMATS', 'ORZ_MARKDOWN_VERSION', 'SETTING_DEFAULTS', 'TEMPLATES', 'TEMPLATE_IDS', 'THEMES', 'THEME_INFO', 'VERSION',
      'assemble', 'cdnBundleUrl', 'engineFiles', 'engineSource', 'extract', 'includeTargets', 'inspect', 'isThemeId', 'letterDate', 'linkTargets', 'newDocument', 'readDocument', 'readLegacy', 'readSettings', 'resolveSettings', 'sha256', 'storedText', 'upgrade',
    ].sort());
    for (const gone of ['buildPagedHtml', 'composeInlineHtml', 'loadThemes', 'loadTemplates', 'pickDefaultTheme', 'findAsset', 'stripBaseImport', 'selfVersion', 'CDN', 'shellParts', 'headerFromLegacySource']) expect(lib).not.toHaveProperty(gone);
    expect(lib.VERSION).toBe(VERSION);
    expect(lib.FORMATS).toEqual([1]);
    expect(lib.DEFAULT_THEME).toBe('light-academic-1');
    expect(lib.TEMPLATES.map((t) => t.id)).toEqual([...TEMPLATE_IDS]);
    expect(lib.TEMPLATES).toHaveLength(12);
    for (const f of ['assets/app.js', 'src/template.ts', 'src/browser-entry.ts', 'src/paged.ts', 'dist/orz-paged.legacy.js', 'dist/template.js', 'dist/browser-entry.js', 'dist/paged.js']) expect(existsSync(f), f).toBe(false);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { bin: Record<string, string>; main: string; exports: Record<string, unknown>; files: string[] };
    expect(pkg.bin).toEqual({ 'orz-paged': 'dist/cli.js' });
    expect(pkg.main).toBe('./dist/lib.js');
    expect(pkg.exports['.']).toEqual({ types: './dist/lib.d.ts', default: './dist/lib.js' });
    expect(pkg.files).toEqual(expect.arrayContaining(['dist', 'assets/themes', 'assets/templates', 'orz-paged-skills', 'docs/embedding.md', 'PROTOCOL.md']));
    // PROTOCOL.md is shipped and points to the canonical spec (D-11)
    expect(readFileSync('PROTOCOL.md', 'utf8')).toMatch(/spec\/host-protocols\.md/);
    expect(pkg.files).not.toContain('assets');
    const bundleSrc = readFileSync('build/bundle.ts', 'utf8');
    expect(bundleSrc).not.toMatch(/legacy\.js|browser-entry|LEGACY_FILE/);
    // nothing in src/ or build/ refers to the 0.x runtime
    for (const f of ['src/lib.ts', 'src/cli.ts', 'src/engine.ts', 'build/bundle.ts', 'tests/global-setup.ts']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/template\.js|assets\/app|__ORZ_PAGED__ =|orzpaged\b|browser-entry/);
  });
});

describe('the package contents', () => {
  it('[L.3] the build starts from an empty dist/ (`rm -rf dist`, as the test setup does) and `npm pack` ships only what src/ compiles to: every dist/*.js has its src/*.ts, no stale module (closed loop round 1: dist/includes.js, known-states.js, sha256.js of the copied CLI core lingered)', async () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['build']).toMatch(/^rm -rf dist && tsc -p tsconfig\.build\.json/);
    expect(readFileSync('tests/global-setup.ts', 'utf8')).toMatch(/rmSync\('dist', \{ recursive: true, force: true \}\)/);
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
    const files = (JSON.parse(out) as Array<{ files: Array<{ path: string }> }>)[0]!.files.map((f) => f.path);
    const js = files.filter((f) => /^dist\/.*\.js$/.test(f) && f !== 'dist/orz-paged.browser.js');
    expect(js.length).toBeGreaterThan(10);
    const stale = js.filter((f) => !existsSync(f.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts')));
    expect(stale).toEqual([]);
    expect(files).toContain('dist/orz-paged.browser.js');
    expect(files).toContain('dist/release.json');
  }, 60_000);
});
