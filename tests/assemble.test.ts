/**
 * The isomorphic assembler (src/assemble.ts) against the FC-18 laws on the
 * shared golden corpus (paged), this repository's 12 templates and hazard
 * texts (claims A.1–A.11).
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as kit from 'orz-markdown/carrier';
import { escapeAttr } from 'orz-markdown/carrier/read';
import { bundleUrl } from 'orz-markdown/carrier/shell';
import { assemble, extract, readDocument, shellParts, storedText, cdnBundleUrl, BUNDLE_FILE, type AssembleOptions } from '../src/assemble.js';
import { VERSION } from '../src/version.js';
import { FALLBACK_LINE, FALLBACK_LINE_CDN, presentationOf } from '../src/presentation.js';
import { corpus, HAZARDS, ENGINE, TEMPLATE_TEXTS, launchChrome } from './helpers.js';

const CORPUS = corpus('paged');
const TEXTS: Array<[string, string, Record<string, string> | undefined]> = [
  ...CORPUS.map((c) => [c.path, c.text, c.includes] as [string, string, Record<string, string> | undefined]),
  ...Object.entries(TEMPLATE_TEXTS).map(([name, text]) => [`template:${name}`, text, undefined] as [string, string, undefined]),
  ...Object.entries(HAZARDS).map(([name, text]) => [`hazard:${name}`, text, undefined] as [string, string, undefined]),
];
const SOME_INCLUDES = { './part.md': 'Included </script> text\r\nwith CR LF and 𝒳\n', 'https://example.test/x.md': '# x\n' };
const OPTION_SETS: Array<[string, AssembleOptions]> = [
  ['inline', { engineSource: ENGINE }],
  ['cdn', { delivery: 'cdn' }],
  ['inline+includes', { engineSource: ENGINE, includes: SOME_INCLUDES }],
  ['cdn+includes', { delivery: 'cdn', includes: SOME_INCLUDES }],
];
const withOwn = (o: AssembleOptions, own: Record<string, string> | undefined): AssembleOptions => (own ? { ...o, includes: own } : o);

describe('FC-18 laws', () => {
  it('[A.1] the corpus is the paged corpus of the orz-markdown package: every template, the elements, dynamic choices, columns', () => {
    expect(CORPUS.map((c) => c.path)).toEqual(
      expect.arrayContaining(['paged/minimal.paged.md', 'paged/elements.paged.md', 'paged/dynamic-choices.paged.md', 'paged/columns-across-pages.paged.md', 'paged/every-template/exam-page.paged.md', 'paged/every-template/cv-elegant.paged.md']),
    );
    expect(CORPUS.filter((c) => c.path.startsWith('paged/every-template/'))).toHaveLength(12);
    expect(Object.keys(TEMPLATE_TEXTS)).toHaveLength(12);
  });

  for (const [name, o] of OPTION_SETS) {
    it(`[A.1] round trip, ${name}: extract(assemble(T)).text === T for every paged corpus file, template and hazard text`, () => {
      for (const [id, text, own] of TEXTS) {
        const html = assemble(text, withOwn(o, own));
        const ex = extract(html);
        expect(ex, id).not.toBeNull();
        expect(ex!.text === text, id).toBe(true);
        expect(ex!.kind, id).toBe('paged');
        expect(ex!.shell, id).toBe(VERSION);
        expect(ex!.delivery, id).toBe(o.delivery ?? 'inline');
        expect(ex!.includes, id).toEqual(own ?? o.includes);
        expect(storedText(text) === text, id).toBe(true);
      }
    });
  }

  it('[A.2] determinism: the same bytes on every call and after a fresh module load', async () => {
    const first = TEXTS.map(([, t, own]) => OPTION_SETS.map(([, o]) => assemble(t, withOwn(o, own))));
    const again = TEXTS.map(([, t, own]) => OPTION_SETS.map(([, o]) => assemble(t, withOwn(o, own))));
    expect(again).toEqual(first);
    vi.resetModules();
    const fresh = await import('../src/assemble.js');
    expect(fresh.assemble).not.toBe(assemble);
    const third = TEXTS.map(([, t, own]) => OPTION_SETS.map(([, o]) => fresh.assemble(t, withOwn(o, own))));
    expect(third).toEqual(first);
  });

  it('[A.2] the assembler modules read no clock, randomness or environment', () => {
    for (const file of MODULES.filter((f) => f !== 'src/starters.ts')) { // starters.ts is data (template prose)
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\bDate\b|Math\.random|\bprocess\b|\bnavigator\b|\blocation\b|performance\.now|crypto\./);
    }
  });

  it('[A.3] idempotence: assemble(extract(F).text, o) === F', () => {
    for (const [id, text, own] of TEXTS) {
      for (const [, o] of OPTION_SETS) {
        const opts = withOwn(o, own);
        const f = assemble(text, opts);
        expect(assemble(extract(f)!.text, opts) === f, id).toBe(true);
        expect(assemble(extract(f)!.text, { ...opts, includes: extract(f)!.includes }) === f, id).toBe(true);
      }
    }
  });

  it('[A.4] content independence: the shell parts depend only on the options and the header\'s presentation (theme, font presets, page size); the document parts not on the delivery', () => {
    const headPart = (html: string): string => /id="orz-shell">[^<]*<\/script>\n([\s\S]*?)\n<\/head>/.exec(html)![1]!;
    const tail = (html: string): string => {
      const island = html.indexOf('id="orz-src"');
      let end = html.indexOf('</script>', island) + '</script>'.length;
      if (html.startsWith('\n<script type="application/json" id="orz-includes">', end)) end = html.indexOf('</script>', end + 1) + '</script>'.length;
      return html.slice(end);
    };
    const presKey = (t: string): string => JSON.stringify(presentationOf(t));
    for (const [, o] of OPTION_SETS) {
      const groups = new Map<string, Set<string>>();
      for (const [, t] of TEXTS) {
        const html = assemble(t, o);
        const k = presKey(t);
        if (!groups.has(k)) groups.set(k, new Set());
        groups.get(k)!.add(`${headPart(html)}\u0000${tail(html)}`);
        // exactly the parts of shellParts for the text's presentation
        const parts = shellParts(o, presentationOf(t));
        expect(headPart(html)).toBe(parts.headHtml);
        expect(tail(html)).toBe(`\n${parts.bodyHtml}\n</body>\n</html>\n`);
      }
      for (const [k, set] of groups) expect(set.size, k).toBe(1);
      // and they carry nothing of a document (uid, title, body, settings other than the presentation)
      expect([...groups.values()].flatMap((g) => [...g]).join('')).not.toMatch(/doc-[0-9a-z]{10}|Annual Report|Buffers|template|page_number|header_left/);
    }
    // the presentation comes from the header only: a body that says "theme: …" changes nothing
    expect(presentationOf('# T\n\ntheme: light-neat-2\npage_size: A3\n')).toEqual(presentationOf(''));
    const themed = assemble('{{nyml\nkind: document\ntheme: light-neat-2\nfont_preset: lora\n}}\n\n# T\n', { delivery: 'cdn' });
    for (const u of presentationOf('{{nyml\nkind: document\ntheme: light-neat-2\nfont_preset: lora\n}}\n').fontUrls) expect(themed).toContain(`<link rel="stylesheet" data-orz-font href="${escapeAttr(u)}" media="not all">`);
    expect(themed).toContain('https://cdn.jsdelivr.net/npm/@fontsource/lora@5/index.css');
    const docPart = (html: string): string => html.replace(/"delivery":"(inline|cdn)"/, '"delivery":"*"').replace(/<script id="orz-engine"[^>]*>[\s\S]*?<\/script>/, '<engine>').replace(/<p class="orz-fallback"[^>]*>[^<]*<\/p>/, '<fallback>');
    for (const [id, text] of TEXTS) {
      const a = docPart(assemble(text, { engineSource: ENGINE }));
      expect(docPart(assemble(text, { delivery: 'cdn' })), id).toBe(a);
      expect(docPart(assemble(text, { engineSource: 'void 0;' })), id).toBe(a);
    }
  });
});

describe('the envelope and the shell parts', () => {
  it('[A.5] the envelope is the kit\'s, with the paged markers, banner and includes island', () => {
    for (const [id, text, own] of TEXTS) {
      for (const [, o] of OPTION_SETS) {
        const opts = withOwn(o, own);
        const html = assemble(text, opts);
        expect(html, id).toBe(kit.assembleEnvelope(text, shellParts(opts, presentationOf(text))));
        const delivery = opts.delivery ?? 'inline';
        expect(html).toContain(`<script type="application/json" id="orz-shell">{"kind":"paged","format":1,"shell":"${VERSION}","delivery":"${delivery}"}</script>`);
        expect(html).toContain(`<meta name="generator" content="orz-paged ${VERSION}">`);
        expect(html).toContain('<!-- orz paged document, text format 1. For AI agents and tools:');
        expect(html).toContain('Skill: https://cdn.jsdelivr.net/npm/orz-paged/orz-paged-skills/SKILL.md');
        expect(html.startsWith('<!doctype html>\n<html lang="')).toBe(true);
        expect(html).toMatch(/<html lang="[^"]*" data-orz-kind="paged">/);
        expect(html.includes('id="orz-includes"'), id).toBe(!!opts.includes);
        // head: viewport, colour scheme, KaTeX, highlight.js and the webfonts, switched off until the read view presents
        expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="color-scheme" content="light">\n<link rel="stylesheet" id="orz-katex" href="https://cdn.jsdelivr.net/npm/katex@');
        expect(html).toMatch(/<link rel="stylesheet" id="orz-hljs" href="[^"]+" media="not all">/);
        // body: the read view (one constant fallback line of the delivery), the chrome mount, the engine
        const line = delivery === 'cdn' ? FALLBACK_LINE_CDN : FALLBACK_LINE;
        expect(html).toContain(`<div id="orz-pages" class="orz-pages" data-orz-copy><p class="orz-fallback" style="opacity:.6;font:14px/1.5 system-ui,sans-serif;max-width:40em;margin:2em auto;padding:0 1em">${line}</p></div></main>\n<div id="orz-chrome"></div>\n<script id="orz-engine"`);
        expect(html).toMatch(/<main id="orz-view" class="orz-view" data-orz-theme="[a-z0-9-]+">/);
      }
    }
    const parts = shellParts({ engineSource: ENGINE });
    expect(parts).toMatchObject({ kind: 'paged', shellVersion: VERSION, delivery: 'inline' });
    expect(shellParts({ engineSource: ENGINE, includes: {} })).not.toHaveProperty('includes');
    // the header decides <title>, lang and #orz-meta
    const doc = CORPUS.find((c) => c.path === 'paged/elements.paged.md')!;
    const html = assemble(doc.text, { delivery: 'cdn' });
    expect(html).toContain('<title>Every Element — Department Annual Report</title>');
    expect(html).toContain('<html lang="en" data-orz-kind="paged">');
    expect(html).toContain('"uid": "doc-p4g3d1e2l9"');
    expect(html).toContain('<meta name="author" content="Yu Wang">');
  });

  it('[A.6] inline holds the engine once; CDN references the release bundle URL and no engine code', () => {
    const text = CORPUS[0]!.text;
    const inline = assemble(text, { engineSource: ENGINE });
    expect(inline.split(ENGINE).length - 1).toBe(1);
    expect(inline).toContain(`<script id="orz-engine">${ENGINE}</script>`);
    const cdn = assemble(text, { delivery: 'cdn' });
    const url = `https://cdn.jsdelivr.net/npm/orz-paged-browser@${VERSION}/orz-paged.browser.js`;
    expect(cdnBundleUrl()).toBe(url);
    expect(bundleUrl({ kind: 'paged', version: VERSION, bundle: { path: BUNDLE_FILE, integrity: '' } })).toBe(url);
    expect(cdn).toContain(`<script id="orz-engine" src="${url}"></script>`);
    expect(cdn).not.toContain(ENGINE);
  });

  it('[A.7] refusals: NUL, lone surrogate, newer format, unknown delivery, missing or unsafe engine', () => {
    expect(() => assemble('a\u0000b\n', { delivery: 'cdn' })).toThrow(/NUL/);
    expect(() => assemble('a\uD800b\n', { delivery: 'cdn' })).toThrow(/surrogate/);
    expect(() => assemble('{{nyml\nkind: document\nformat: 2\n}}\n\nfuture\n', { delivery: 'cdn' })).toThrow(/format 2/);
    expect(() => assemble('x', { delivery: 'zip' as 'cdn' })).toThrow(/unknown delivery/);
    expect(() => assemble('x')).toThrow(/engine source/);
    expect(() => assemble('x', { engineSource: '' })).toThrow(/engine source/);
    for (const bad of ['a="</script>"', 'a="<script>"', 'a=1;\r\nb=2;', 'a="<\\/script>"']) {
      expect(() => assemble('x', { engineSource: bad }), bad).toThrow(/script-safe/);
    }
  });

  it('[A.10] extract is the kit\'s own function; readDocument is the kit\'s with kind paged by default', () => {
    expect(extract).toBe(kit.extract);
    for (const c of CORPUS) {
      expect(readDocument(c.text), c.path).toEqual(kit.readDocument(c.text, { kind: 'paged' }));
      expect(readDocument(c.text, { filename: 'x.md' }).kind).toBe('md');
    }
    expect(readDocument('# plain\n').kind).toBe('paged');
    expect(readDocument('{{nyml\nkind: document\ncarrier: slides\n}}\n').kind).toBe('slides');
    expect(readDocument('{{nyml\nkind: document\ncarrier: bogus\n}}\n').kind).toBe('paged');
    expect(readDocument('# x\n', { kind: 'md' }).kind).toBe('md');
  });

  it('[A.11] the title chain (FC-18 §8.1, paged): header title, else the first top-level heading, else the first *-title element\'s title or text, else Untitled', () => {
    for (const c of CORPUS) expect(readDocument(c.text).title, c.path).toBe(c.derivedTitle);
    expect(readDocument('{{nyml\nkind: document\n}}\n\n{{nyml\nkind: report-title\ntitle: From The Element\n}}\n\nbody\n').title).toBe('From The Element');
    expect(readDocument('{{nyml\nkind: exam-title\ntext: Element Text\n}}\n').title).toBe('Element Text');
    expect(readDocument('{{nyml\nkind: cv-header\nfull_name: Not A Title\n}}\n\n{{nyml\nkind: article-title\ntitle: Second\n}}\n').title).toBe('Second');
    expect(readDocument('{{nyml\nkind: article-title\nsubtitle: no title field\n}}\n\n{{nyml\nkind: report-title\ntitle: Not Tried\n}}\n').title).toBe('Untitled');
    expect(readDocument('{{nyml\nkind: article-title\ntitle: Element\n}}\n\n# Heading Wins\n').title).toBe('Heading Wins');
    expect(readDocument('{{nyml\nkind: document\ntitle: Header Wins\n}}\n\n# Heading\n').title).toBe('Header Wins');
    expect(assemble('{{nyml\nkind: exam-title\ntitle: Quiz <1> & 2\n}}\n', { delivery: 'cdn' })).toContain('<title>Quiz &lt;1&gt; &amp; 2</title>');
  });
});

// ── isomorphic: no Node built-ins, and the same bytes in real Chrome ────────

const MODULES = ['src/assemble.ts', 'src/inspect.ts', 'src/legacy.ts', 'src/themes.ts', 'src/version.ts', 'src/starters.ts', 'src/doc/settings.ts', 'src/doc/templates.ts'];

async function browserBundle(): Promise<string> {
  const { build } = await import('esbuild');
  const entry = `export { assemble, newDocument, readDocument } from './src/assemble.ts'; export { inspect } from './src/inspect.ts'; export { upgrade } from './src/legacy.ts';`;
  const out = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'browser', format: 'iife', globalName: 'OrzPagedTest', target: ['es2020'], write: false, logLevel: 'silent', charset: 'utf8',
  });
  return out.outputFiles[0]!.text;
}

describe('isomorphic', () => {
  it('[A.8] the assembler modules bundle for the browser with no Node built-in', async () => {
    const { build } = await import('esbuild');
    for (const file of MODULES) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/from ['"](node:|fs['"]|path['"]|os['"]|crypto['"]|url['"]|module['"])/);
      const out = await build({ entryPoints: [file], bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent', metafile: true });
      const inputs = Object.keys(out.metafile!.inputs);
      expect(inputs.filter((p) => p.startsWith('node:') || /^(fs|path|os|crypto|url|module)$/.test(p)), file).toEqual([]);
    }
  });
});

const browser = await launchChrome();
const chrome = browser ? describe : describe.skip;
afterAll(async () => {
  await browser?.close();
});

chrome('real Chrome (playwright-core, channel chrome)', () => {
  it('[A.9] browser parity: Chrome writes the same bytes as Node for every paged corpus file, template and hazard text', async () => {
    const code = await browserBundle();
    const page = await browser!.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: code });
    const cases = TEXTS.flatMap(([id, text, own]) => OPTION_SETS.map(([name, o]) => ({ id: `${id} ${name}`, text, opts: withOwn(o, own) })));
    const fromChrome = await page.evaluate((cs) => cs.map((c) => (globalThis as unknown as { OrzPagedTest: { assemble(t: string, o: unknown): string } }).OrzPagedTest.assemble(c.text, c.opts)), cases);
    cases.forEach((c, i) => expect(fromChrome[i] === assemble(c.text, c.opts), c.id).toBe(true));
    await page.close();
  }, 120_000);
});
