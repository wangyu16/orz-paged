/**
 * Rebuild step 3 — the browser engine and its package (claims W.1–W.8 and
 * A.9 on the real bundle): the bundle rule (IIFE, ESM and the paged runtime),
 * one KaTeX, Paged.js once, release.json, the `OrzCarrier` surface (FC-19
 * §2), Node/Chrome parity, the package exports, `renderPreview`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { escapeScriptText } from 'orz-markdown/carrier/read';
import { isScriptSafe, parseManifest, sandboxDocument } from 'orz-markdown/carrier/shell';
import { assemble, extract, readDocument, type AssembleOptions } from '../src/assemble.js';
import { VERSION } from '../src/version.js';
import { engineFiles, engineSource } from '../src/engine.js';
import { BUNDLE_FILE, ESM_FILE, asciiOnly, buildBrowser, checkBundleRule, scriptSafe, writeBrowser } from '../build/bundle.js';
import { bundle, launch, routeCdn, serve, tempDir, type Browser, type Page } from './browser-env.js';
import { corpus, HAZARDS, TEMPLATE_TEXTS } from './helpers.js';

const b = await bundle();
const CORPUS = corpus('paged');
const TEXTS: Array<[string, string, Record<string, string> | undefined]> = [
  ...CORPUS.map((c) => [c.path, c.text, c.includes] as [string, string, Record<string, string> | undefined]),
  ...Object.entries(TEMPLATE_TEXTS).map(([name, text]) => [`template:${name}`, text, undefined] as [string, string, undefined]),
  ...Object.entries(HAZARDS).map(([name, text]) => [`hazard:${name}`, text, undefined] as [string, string, undefined]),
];
const SOME_INCLUDES = { './part.md': 'Included </script> text\r\nwith CR LF and 𝒳\n', 'https://example.test/x.md': '# x\n' };
const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

describe('the bundle and its package (Node)', () => {
  it('[W.1] the bundle rule: no <script / </script (any case, after backslashes), no CR, no NUL; script-safe; ASCII; escaping leaves it unchanged — IIFE, ESM and the paged runtime', () => {
    for (const [name, code] of [[BUNDLE_FILE, b.iife], [ESM_FILE, b.esm], ['runtime', b.runtime]] as const) {
      expect(code.length, name).toBeGreaterThan(100_000);
      expect(/<\\*\/?script/i.test(code), name).toBe(false);
      expect(code.includes('\r'), name).toBe(false);
      expect(code.includes('\u0000'), name).toBe(false);
      expect(isScriptSafe(code), name).toBe(true);
      expect(escapeScriptText(code) === code, name).toBe(true);
      expect(() => checkBundleRule(code, name)).not.toThrow();
      expect(/[^\x00-\x7f]/.test(code), name).toBe(false);
      expect(Buffer.byteLength(code, 'utf8'), name).toBe(code.length);
    }
    expect(scriptSafe('a="</script>";b="<SCRIPT";c="<\\/script"')).toBe('a="\\x3C/script>";b="\\x3CSCRIPT";c="\\x3C\\/script"');
    expect(() => checkBundleRule('a="</script>"', 'x')).toThrow(/script-safe/);
    expect(() => checkBundleRule('a=1;\r\nb=2;', 'x')).toThrow();
    expect(() => checkBundleRule('a=/[\u00e9]/;', 'x')).toThrow(/ASCII/);
    expect(asciiOnly('a=/[îï]/u.test(s)||"𝒳"')).toBe('a=/[\\u00ee\\u00ef]/u.test(s)||"\\ud835\\udcb3"');
    // the build checks after the rewrite and before the integrity
    const src = readFileSync('build/bundle.ts', 'utf8');
    expect(src.indexOf('scriptSafe(asciiOnly(iifeOut')).toBeGreaterThan(0);
    expect(src.indexOf('checkBundleRule(iife')).toBeGreaterThan(src.indexOf('scriptSafe(asciiOnly(iifeOut'));
    expect(src.indexOf('sri(iife)')).toBeGreaterThan(src.indexOf('checkBundleRule(iife'));
  });

  it('[W.2] one KaTeX in the bundle (katex and katex/contrib/mhchem resolve to one build); Paged.js 0.4.3 only inside the runtime, which the engine carries once as a string', () => {
    for (const code of [b.iife, b.esm]) {
      expect(code.split('KaTeX parse error').length - 1).toBe(1);
      expect(code).toContain('\\ce');
    }
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, { version?: string }> };
    expect(lock.packages['node_modules/pagedjs']!.version).toBe('0.4.3');
    // a Paged.js marker: in the runtime, and in the engine only as the runtime's text (escaped once in a string literal)
    const marker = 'data-pagedjs-inserted-styles';
    expect(b.runtime.includes(marker)).toBe(true);
    expect(b.iife.split(marker).length - 1).toBe(b.runtime.split(marker).length - 1);
    expect(b.iife.length).toBeLessThan(2_400_000);
  });

  it('[W.3] release.json: a valid manifest of this release whose integrity is the SHA-384 of the bundle\'s exact bytes', async () => {
    const raw = JSON.parse(b.release) as Record<string, unknown>;
    expect(parseManifest(raw, 'paged')).not.toBeNull();
    expect(raw).toEqual({
      kind: 'paged', version: VERSION, formats: [1],
      notes: `https://github.com/wangyu16/orz-paged/blob/main/CHANGELOG.md#${VERSION.replace(/\./g, '')}`,
      bundle: { path: BUNDLE_FILE, integrity: `sha384-${createHash('sha384').update(Buffer.from(b.iife, 'utf8')).digest('base64')}` },
    });
    expect(b.release.endsWith('\n')).toBe(true);
    const t = tempDir();
    try {
      const paths = writeBrowser(b, t.dir);
      const bytes = readFileSync(paths.bundle);
      expect(bytes.equals(Buffer.from(b.iife, 'utf8'))).toBe(true);
      const written = JSON.parse(readFileSync(paths.release, 'utf8')) as { bundle: { integrity: string } };
      expect(written.bundle.integrity).toBe(`sha384-${createHash('sha384').update(bytes).digest('base64')}`);
      expect(readFileSync(paths.esm, 'utf8') === b.esm).toBe(true);
    } finally {
      t.clean();
    }
    // the staged copies (global setup): the package and the library's dist/ hold the same bytes
    expect(readFileSync(join('browser', BUNDLE_FILE), 'utf8') === b.iife).toBe(true);
    expect(readFileSync(join('dist', BUNDLE_FILE), 'utf8') === b.iife).toBe(true);
    expect(readFileSync(join('dist', 'release.json'), 'utf8')).toBe(b.release);
    // the Node library's engine (src/engine.ts) reads and verifies exactly those bytes
    expect(engineFiles().integrity).toBe(b.integrity);
    expect(engineSource() === b.iife).toBe(true);
    // a build of another version writes that version everywhere (the conformance harness's `next`)
    const next = await buildBrowser({ version: '9.9.9' });
    expect(JSON.parse(next.release)).toMatchObject({ version: '9.9.9' });
    expect(next.iife).toContain('"9.9.9"');
  }, 120_000);

  it('[W.5] the package: exports (import → ESM, default → IIFE), files, types and version in lockstep', () => {
    const pkg = JSON.parse(readFileSync('browser/package.json', 'utf8')) as { name: string; version: string; main: string; exports: Record<string, unknown>; files: string[]; types: string };
    const root = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(pkg.name).toBe('orz-paged-browser');
    expect(pkg.version).toBe(root.version);
    expect(pkg.main).toBe(BUNDLE_FILE);
    expect(pkg.exports['.']).toEqual({ types: './index.d.ts', import: `./${ESM_FILE}`, require: './require.cjs', default: `./${BUNDLE_FILE}` });
    expect(pkg.exports['./release.json']).toBe('./release.json');
    expect(pkg.files).toEqual(expect.arrayContaining([BUNDLE_FILE, ESM_FILE, 'release.json', 'index.d.ts', 'README.md', 'require.cjs', 'docs/embedding.md']));
    expect(readFileSync('browser/docs/embedding.md', 'utf8')).toBe(readFileSync('docs/embedding.md', 'utf8'));
    // every runtime export of the ESM build is declared in index.d.ts
    const exported = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(b.esm)![1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!).filter(Boolean).sort();
    expect(exported).toEqual(['DEFAULT_TEMPLATE', 'DEFAULT_THEME', 'OrzCarrier', 'TEMPLATE_IDS', 'THEMES', 'assemble', 'editHeader', 'extract', 'formats', 'kind', 'mountEditor', 'newDocument', 'printDocument', 'readDocument', 'renderPreview', 'version']);
    const dts = readFileSync('browser/index.d.ts', 'utf8');
    for (const name of exported) expect(dts, name).toMatch(new RegExp(`export declare (const|function) ${name}\\b`));
    expect(dts).toMatch(/interface OrzCarrierApi \{[^}]*kind: 'paged';[^}]*readonly standalone\?: StandaloneFile \| null;/);
    expect(dts).not.toMatch(/mdhtml|\.md\.html/);
  });

  it('[W.7] publishing safety: prepublishOnly refuses a release.json that does not match the files (version, integrity), require() gets a clear error', () => {
    const pkg = JSON.parse(readFileSync('browser/package.json', 'utf8')) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.prepublishOnly).toBe('node scripts/check-release.mjs');
    const run = (dir: string): { status: number | null; out: string } => {
      const r = spawnSync(process.execPath, [join(dir, 'scripts', 'check-release.mjs')], { encoding: 'utf8' });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    };
    expect(run('browser')).toMatchObject({ status: 0 });
    const t = tempDir('orz-paged-publish-');
    try {
      const pkgDir = join(t.dir, 'browser');
      cpSync('browser', pkgDir, { recursive: true });
      const release = JSON.parse(readFileSync(join(pkgDir, 'release.json'), 'utf8')) as { version: string; bundle: { integrity: string } };
      writeFileSync(join(pkgDir, BUNDLE_FILE), `${b.iife};`, 'utf8');
      expect(run(pkgDir)).toMatchObject({ status: 1, out: expect.stringMatching(/integrity is not the SHA-384/) });
      writeFileSync(join(pkgDir, BUNDLE_FILE), b.iife, 'utf8');
      writeFileSync(join(pkgDir, 'release.json'), JSON.stringify({ ...release, version: '0.0.1' }), 'utf8');
      expect(run(pkgDir)).toMatchObject({ status: 1, out: expect.stringMatching(/release\.json says version 0\.0\.1/) });
      writeFileSync(join(pkgDir, 'release.json'), JSON.stringify({ ...release, kind: 'md' }), 'utf8');
      expect(run(pkgDir)).toMatchObject({ status: 1, out: expect.stringMatching(/not "paged"/) });
    } finally { t.clean(); }
    expect(() => createRequire(import.meta.url)('../browser/require.cjs')).toThrow(/require\(\) is not supported.*import.*<script/);
  });

  it('[W.8] the standalone startup is the kit\'s carrier/app: the entry captures its engine source, then startCarrier(PAGED_KIND); the kind supplies the paged side of the seam; nothing of the 0.x shell', () => {
    const entry = readFileSync('src/browser/index.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(entry).toMatch(/from 'orz-markdown\/carrier\/app'/);
    const capture = 'captureEngineSource(undefined, { bundle: BUNDLE_FILE })';
    expect(entry.indexOf(capture)).toBeGreaterThan(0);
    expect(entry.indexOf('startCarrier(PAGED_KIND)')).toBeGreaterThan(entry.indexOf(capture));
    const kind = readFileSync('src/browser/paged/kind.ts', 'utf8');
    for (const member of ['readDocument', 'renderPreview', 'extract', 'createReadView', 'settings: PAGED_SETTINGS', 'actions: PAGED_ACTIONS', "repo: 'https://github.com/wangyu16/orz-paged'", 'newDocument({ template: DEFAULT_TEMPLATE })', 'readerControls', "key: 'pageZoom'"]) expect(kind, member).toContain(member);
    const carrier = readFileSync('src/browser/carrier.ts', 'utf8');
    for (const k of ['attachSettings(shell, PAGED_SETTINGS', 'followPresentation(shell, pagedPreviewPresentation)', 'frameDocument: pagedFrameDocument', 'diff: false']) expect(carrier, k).toContain(k);
    // the new code depends on none of the 0.x shell (template.ts, app.js, browser-entry.ts, paged.ts)
    for (const f of ['src/browser/index.ts', 'src/browser/esm.ts', 'src/browser/carrier.ts', 'src/paged/runtime.ts', 'src/paged/cols-flow.ts', 'src/assemble.ts', 'src/presentation.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/from '\.\.?\/(\.\.\/)?(template|browser-entry|paged)\.js'|assets\/app\.js|__ORZ_PAGED__|window\.orzpaged/);
    }
    for (const f of ['kind', 'read-view', 'render', 'settings', 'actions', 'preview', 'versions', 'zoom', 'themes']) {
      const s = readFileSync(`src/browser/paged/${f}.ts`, 'utf8');
      expect(s, f).not.toMatch(/from '\.\.\/\.\.\/(template|browser-entry|paged)\.js'/);
    }
    expect(existsSync('src/browser/paged/kind.ts')).toBe(true);
    expect(existsSync('src/browser/paged/kind-menu.ts')).toBe(false); // the kit's submenus (2.3.0) replaced it
  });
});

const browser: Browser | null = await launch();
afterAll(async () => { await browser?.close(); });
const chrome = browser ? describe : describe.skip;

const site = await serve(process.cwd(), { '/blank.html': { body: '<!doctype html><html><body></body></html>' } });
afterAll(async () => { await site.close(); });

/** A blank served page with the IIFE loaded inline (as in an inline file, without an island). */
async function bundlePage(): Promise<Page> {
  const ctx = await browser!.newContext();
  await routeCdn(ctx);
  const page = await ctx.newPage();
  await page.goto(`${site.url}/blank.html`);
  await page.addScriptTag({ content: b.iife });
  return page;
}

type Carrier = { kind: string; version: string; formats: number[]; assemble(t: string, o?: unknown): Promise<string>; extract(h: string): unknown; readDocument(t: string): unknown; mountEditor: unknown; renderPreview(t: string, o?: unknown): Promise<string>; standalone?: unknown };

chrome('real Chrome (playwright-core, channel chrome)', () => {
  it('[W.4] globalThis.OrzCarrier per FC-19 §2; extract/readDocument agree with the kit; nothing booted outside a file (no runtime, no storage, no chrome)', async () => {
    const page = await bundlePage();
    const text = CORPUS.find((c) => c.path === 'paged/elements.paged.md')!.text;
    const html = assemble(text, { delivery: 'cdn' });
    const r = await page.evaluate(async ({ text, html }) => {
      const C = (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier;
      const p = C.assemble(text, { delivery: 'cdn' });
      return {
        keys: Object.keys(C).sort(),
        kind: C.kind, version: C.version, formats: C.formats,
        types: ['assemble', 'extract', 'readDocument', 'mountEditor', 'renderPreview'].map((k) => typeof (C as unknown as Record<string, unknown>)[k]),
        promise: p instanceof Promise, html: await p,
        extracted: C.extract(html), info: C.readDocument(text), standalone: C.standalone,
        storage: Object.keys(localStorage), chrome: !!document.getElementById('orz-chrome'),
        runtime: typeof (window as unknown as { __orzPaged?: unknown }).__orzPaged, styles: document.querySelectorAll('style').length,
      };
    }, { text, html });
    expect(r.keys).toEqual(['assemble', 'extract', 'formats', 'kind', 'mountEditor', 'printDocument', 'readDocument', 'renderPreview', 'standalone', 'version']); // printDocument: the kit's print helper (round 3)
    expect(r).toMatchObject({ kind: 'paged', version: VERSION, formats: [1], promise: true, standalone: null, storage: [], chrome: false, runtime: 'undefined', styles: 0 });
    expect(r.types).toEqual(['function', 'function', 'function', 'function', 'function']);
    expect(r.html === html).toBe(true);
    expect(r.extracted).toEqual(extract(html));
    expect(r.info).toEqual(JSON.parse(JSON.stringify(readDocument(text, { kind: 'paged' }))));
    const refused = await page.evaluate(async () => {
      const C = (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier;
      const out: string[] = [];
      for (const [t, o] of [['a\u0000b', { delivery: 'cdn' }], ['{{nyml\nkind: document\nformat: 2\n}}\n', { delivery: 'cdn' }], ['x', { delivery: 'zip' }], ['x', { engineSource: '"</script>"' }]] as const) {
        try { await C.assemble(t, o); out.push('resolved'); } catch (e) { out.push(String((e as Error).message)); }
      }
      return out;
    });
    expect(refused[0]).toMatch(/NUL/);
    expect(refused[1]).toMatch(/format 2/);
    expect(refused[2]).toMatch(/unknown delivery/);
    expect(refused[3]).toMatch(/script-safe/);
    await page.context().close();
  }, 120_000);

  it('[W.4] the bundle alone assembles in a sandbox="allow-scripts" frame (the quiet update\'s sandbox) and writes the Node bytes', async () => {
    const ctx = await browser!.newContext();
    const page = await ctx.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    const text = CORPUS.find((c) => c.path === 'paged/every-template/report-page.paged.md')!;
    const out = await page.evaluate(async ({ srcdoc, text, includes, bundleText }) => {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.srcdoc = srcdoc;
      const results: Array<{ ok: boolean; html?: string; version?: string; error?: string }> = [];
      await new Promise<void>((resolve) => {
        let n = 0;
        addEventListener('message', (e) => {
          if (e.source !== f.contentWindow) return;
          const d = e.data as { type: string; ok: boolean; html?: string; version?: string; error?: string };
          if (d.type === 'orz-reassemble-ready') {
            f.contentWindow!.postMessage({ type: 'orz-reassemble', id: 'a', text, delivery: 'inline', engineSource: bundleText, includes }, '*');
            f.contentWindow!.postMessage({ type: 'orz-reassemble', id: 'b', text, delivery: 'inline', includes }, '*');
            f.contentWindow!.postMessage({ type: 'orz-reassemble', id: 'c', text, delivery: 'cdn' }, '*');
          } else if (d.type === 'orz-reassembled') { results.push(d); if (++n === 3) resolve(); }
        });
        document.body.append(f);
      });
      return results;
    }, { srcdoc: sandboxDocument(b.iife), text: text.text, includes: SOME_INCLUDES, bundleText: b.iife });
    expect(out.map((r) => r.ok)).toEqual([true, true, true]);
    const inline = assemble(text.text, { engineSource: b.iife, includes: SOME_INCLUDES });
    expect(out[0].html === inline).toBe(true);
    expect(out[1].html === inline).toBe(true);
    expect(out[2].html === assemble(text.text, { delivery: 'cdn' })).toBe(true);
    expect(out.every((r) => r.version === VERSION)).toBe(true);
    await ctx.close();
  }, 120_000);

  it('[A.9] browser parity with the real bundle: OrzCarrier.assemble in Chrome writes the Node bytes for every paged corpus file, template and hazard text (inline with the bundle given and defaulted, cdn, with and without includes)', async () => {
    const page = await bundlePage();
    const sets: Array<[string, AssembleOptions]> = [['inline', {}], ['cdn', { delivery: 'cdn' }], ['inline+includes', { includes: SOME_INCLUDES }], ['cdn+includes', { delivery: 'cdn', includes: SOME_INCLUDES }]];
    const cases = TEXTS.flatMap(([id, text, own]) => sets.map(([name, o]) => ({ id: `${id} ${name}`, text, opts: own ? { ...o, includes: own } : o })));
    // the bytes are compared by SHA-256 (an inline file is ~2 MB)
    const fromChrome = await page.evaluate(async (cs) => {
      const C = (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier;
      const hex = (buf: ArrayBuffer): string => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
      const out: string[] = [];
      for (const c of cs) out.push(hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(await C.assemble(c.text, c.opts)))));
      return out;
    }, cases);
    cases.forEach((c, i) => {
      const node = assemble(c.text, (c.opts.delivery ?? 'inline') === 'inline' ? { ...c.opts, engineSource: b.iife } : c.opts);
      expect(fromChrome[i], c.id).toBe(sha(node));
    });
    await page.context().close();
  }, 240_000);

  it('[W.2] \\ce{H2O} renders through the bundle (mhchem on the KaTeX that renders)', async () => {
    const page = await bundlePage();
    const html = await page.evaluate(() => (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier.renderPreview('Water: $\\ce{H2O}$ and $\\ce{CO2 + C -> 2 CO}$\n'));
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('katex-error');
    expect(html).toMatch(/<msub>/);
    await page.context().close();
  });

  it('[W.6] renderPreview: the content HTML (versions applied, twin links, includes from a record or the app), or a script-free document with the print theme and page CSS', async () => {
    const page = await bundlePage();
    const text = '{{nyml\nkind: document\ntitle: Pre view <b> & "q"\ntheme: light-neat-2\npage_size: A5\ndynamic_choices: |\n  answer-key: hide\n}}\n\n# Heading\n\nSee [next](next.md).\n\n<div data-show-when="answer-key=show">THE-KEY</div>\n\n{{md parts/a.md}}\n\n{{md https://example.test/b.md}}\n';
    const r = await page.evaluate(async (text) => {
      const C = (globalThis as unknown as { OrzCarrier: Carrier }).OrzCarrier;
      return {
        plain: await C.renderPreview(text),
        rec: await C.renderPreview(text, { includes: { 'parts/a.md': 'FILE-INCLUDED\n', 'https://example.test/b.md': 'URL-INCLUDED\n' } }),
        app: await C.renderPreview(text, { fetchInclude: async (u: string) => (u === 'https://example.test/b.md' ? 'APP-INCLUDED\n' : null), twinLinks: false }),
        doc: await C.renderPreview(text, { document: true }),
      };
    }, text);
    expect(r.plain.startsWith('<main class="orz-doc markdown-body">')).toBe(true);
    expect(r.plain).toContain('href="next.md.html"');
    expect(r.plain).not.toContain('THE-KEY'); // the header's version: answer key hidden
    expect(r.plain).toContain('<p class="orz-include-missing" role="note" data-md="{{md parts/a.md}}"><small>Included file not available: parts/a.md</small></p>');
    expect(r.plain).toMatch(/data-src-line="\d+"/);
    expect(r.rec).toContain('FILE-INCLUDED');
    expect(r.rec).toContain('URL-INCLUDED');
    expect(r.app).toContain('APP-INCLUDED');
    expect(r.app).toContain('href="next.md"');
    expect(r.doc.startsWith('<!doctype html>')).toBe(true);
    expect(r.doc).toContain('<title>Pre view &lt;b&gt; &amp; "q"</title>');
    expect(r.doc).toContain('size: A5'); // the page CSS
    expect(r.doc).toContain('.orz-doc'); // the print theme
    expect(/<script/i.test(r.doc)).toBe(false);
    await page.context().close();
  });
});
