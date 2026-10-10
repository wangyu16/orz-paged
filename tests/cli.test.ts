/**
 * Rebuild step 5 — the CLI (FC-10; claims T.1–T.22; orz-mdhtml 1.0's
 * tests/cli.test.ts for the paged kind). Every test spawns the
 * real CLI — `dist/cli.js`, compiled by tests/global-setup.ts as `npm run
 * build` does — on files in a temporary folder, and compares what it wrote with the
 * library's own results: golden files, byte-exact round trips (CR LF, BOM),
 * the legacy fixtures, `--json` that parses, exit statuses, and the
 * overwrite guards.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintHeader, readHeader, UID_PATTERN } from 'orz-markdown/carrier';
import { assemble, extract, inspect, readDocument, readLegacy, upgrade, DEFAULT_TEMPLATE, DEFAULT_THEME, ORZ_MARKDOWN_VERSION, TEMPLATES, THEME_INFO, VERSION } from '../src/lib.js';
import { storedText } from '../src/assemble.js';
import { presentationOf } from '../src/presentation.js';
import { sha256 } from 'orz-markdown/carrier';
import { createHash } from 'node:crypto';
import { corpus, HAZARDS, LEGACY_FILES, read, withLegacySource } from './helpers.js';

const CLI = join(process.cwd(), 'dist', 'cli.js');
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'orz-paged-cli-')));
/** The CLI's cache (the pair records of T.11) lives here, never in the user's ~/.cache. */
const CACHE = join(tmp, '.cache');
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
/** A fresh folder for one scenario. */
const folder = (): string => { const d = join(tmp, `t${++n}`); mkdirSync(d); return d; };

interface Run { code: number; stdout: string; stderr: string }
/** Spawn the CLI (cwd = the given folder, so relative names are relative to it). */
function cli(args: string[], cwd: string = tmp, env: NodeJS.ProcessEnv = {}): Promise<Run> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, XDG_CACHE_HOME: CACHE, ...env } }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
      if (error && typeof error.code !== 'number') reject(error); else resolve({ code, stdout, stderr });
    });
  });
}
/** The CLI's raw stdout bytes. */
function cliBytes(args: string[], cwd: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [CLI, ...args], { cwd, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, XDG_CACHE_HOME: CACHE } }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}
const json = (r: Run): Record<string, unknown> => JSON.parse(r.stdout) as Record<string, unknown>;
const bytes = (path: string): Buffer => readFileSync(path);
const text = (path: string): string => new TextDecoder('utf-8', { ignoreBOM: true }).decode(readFileSync(path));
const write = (path: string, s: string): void => writeFileSync(path, s, 'utf8');
/** Set a file's modification time (seconds since the epoch). */
const touch = (path: string, t: number): void => utimesSync(path, t, t);
const noTemp = (dir: string): void => { expect(readdirSync(dir).filter((f) => f.includes('.orz-') && f.endsWith('.tmp'))).toEqual([]); };

/** The golden files hold the two versions as placeholders, so a version bump does not rewrite them. */
const golden = (s: string): string => s.split(VERSION).join('{{VERSION}}').split(ORZ_MARKDOWN_VERSION).join('{{ORZ_MARKDOWN}}');
/** The 0.x fixture's report names only the fixture's own version (0.7.3, a constant), never this tool's: kept as it is. */
const goldenLegacy = (s: string): string => s.split(ORZ_MARKDOWN_VERSION).join('{{ORZ_MARKDOWN}}');
const GOLDEN = 'tests/fixtures/cli';

describe.concurrent('the CLI', () => {
  it('[T.1] assemble (and `orz-paged <file.paged.md>`) writes x.paged.html = the library\'s assemble of the exact text: inline by default, --cdn, -o, -o -; golden output', async () => {
    const d = folder();
    const source = read(`${GOLDEN}/golden.paged.md`);
    write(join(d, 'golden.paged.md'), source);
    // the cdn file against the checked-in golden (the versions as placeholders)
    const g = await cli(['assemble', 'golden.paged.md', '--cdn', '-o', 'golden.cdn.paged.html'], d);
    expect(g.code, g.stderr).toBe(0);
    expect(golden(text(join(d, 'golden.cdn.paged.html')))).toBe(read(`${GOLDEN}/golden.cdn.paged.html`));
    expect(g.stdout).toBe(`Wrote ${join(d, 'golden.cdn.paged.html')} (cdn, orz-paged ${VERSION})\n  sha256 ${sha256(storedText(source))} (the text it holds; --replaces takes it)\n`);

    const samples: Array<[string, string]> = [
      ['crlf-bom', `\uFEFF${source.replace(/\n/g, '\r\n')}`],
      ['cr', HAZARDS['cr']!],
      ['script-close', HAZARDS['script-close']!],
      ['corpus', corpus('paged')[0]!.text],
      ['template', read('assets/templates/exam-page.md')],
    ];
    for (const [name, t] of samples) {
      write(join(d, `${name}.paged.md`), t);
      const r = await cli(['assemble', `${name}.paged.md`, '--json'], d);
      expect(r.code, r.stderr).toBe(0);
      const out = join(d, `${name}.paged.html`);
      expect(bytes(out).equals(Buffer.from(assemble(t), 'utf8')), name).toBe(true);
      expect(extract(text(out))!.text === t, name).toBe(true);
      const info = readDocument(t, { kind: 'paged' });
      expect(json(r)).toEqual({ ok: true, command: 'assemble', input: join(d, `${name}.paged.md`), output: out, kind: 'paged', format: 1, shell: VERSION, delivery: 'inline', uid: info.meta.uid ?? null, title: info.title, theme: info.theme ?? null, themeEffective: presentationOf(t).theme, template: info.header?.fields['template'] ?? null, includes: 0, resolved: 0, unresolved: [], stale: [], backup: null, replaced: null, sha256: sha256(storedText(t)), bytes: Buffer.byteLength(assemble(t), 'utf8'), warnings: json(r).warnings });
      // the shorthand is the same command
      rmSync(out);
      expect((await cli([`${name}.paged.md`], d)).code).toBe(0);
      expect(bytes(out).equals(Buffer.from(assemble(t), 'utf8'))).toBe(true);
      // --cdn
      expect((await cli([`${name}.paged.md`, '--cdn', '--force'], d)).code).toBe(0);
      expect(text(out)).toBe(assemble(t, { delivery: 'cdn' }));
    }
    // -o elsewhere, and -o - to stdout
    expect((await cli(['assemble', 'crlf-bom.paged.md', '-o', 'sub-out.paged.html'], d)).code).toBe(0);
    expect(text(join(d, 'sub-out.paged.html')) === assemble(samples[0]![1])).toBe(true);
    const so = await cli(['assemble', 'cr.paged.md', '--cdn', '-o', '-'], d);
    expect(so.code).toBe(0);
    expect(so.stdout).toBe(assemble(HAZARDS['cr']!, { delivery: 'cdn' }));
    noTemp(d);
  }, 240_000);

  it('[T.2] new writes a lint-clean text twin from a template (carrier paged, a fresh uid, the given keys) and with --html its file; stdout without a file; refusals', async () => {
    const d = folder();
    const r = await cli(['new', 'exam.paged.md', '--template', 'exam-page', '--title', 'Midterm', '--theme', 'light-playful-1', '--html', '--json'], d);
    expect(r.code, r.stderr).toBe(0);
    const t = text(join(d, 'exam.paged.md'));
    const h = readHeader(t)!;
    expect(t.split('\n').slice(0, 12)).toEqual(['{{nyml', 'kind: document', 'carrier: paged', `uid: ${h.fields['uid']}`, 'title: Midterm', 'template: exam-page', 'page_number_position: footer-center', 'page_number_style: page-n-of-N', 'dynamic_choices: |', '  answer-key: hide', 'theme: light-playful-1', '}}']);
    expect(h.fields).toMatchObject({ carrier: 'paged', title: 'Midterm', theme: 'light-playful-1', template: 'exam-page' });
    expect(UID_PATTERN.test(h.fields['uid']!)).toBe(true);
    expect(lintHeader(t, 'paged')).toEqual([]);
    expect(text(join(d, 'exam.paged.html')) === assemble(t)).toBe(true);
    expect(json(r)).toEqual({ ok: true, command: 'new', file: join(d, 'exam.paged.md'), html: join(d, 'exam.paged.html'), kind: 'paged', format: 1, uid: h.fields['uid'], title: 'Midterm', theme: 'light-playful-1', themeEffective: 'light-playful-1', template: 'exam-page', sha256: sha256(t), delivery: 'inline', shell: VERSION, backups: [], warnings: [] });
    // every template; the default one; a second one has another uid; --cdn for its file
    for (const tpl of TEMPLATES) {
      const n = await cli(['new', `${tpl.id}.paged.md`, '--template', tpl.id, '--json'], d);
      expect(n.code, tpl.id).toBe(0);
      const tt = text(join(d, `${tpl.id}.paged.md`));
      expect(readHeader(tt)!.fields['template'], tpl.id).toBe(tpl.id);
      expect(lintHeader(tt, 'paged'), tpl.id).toEqual([]);
    }
    expect((await cli(['new', 'two.paged.md', '--html', '--cdn'], d)).code).toBe(0);
    const two = text(join(d, 'two.paged.md'));
    expect(readHeader(two)!.fields['uid']).not.toBe(h.fields['uid']);
    expect(readHeader(two)!.fields['template']).toBe(DEFAULT_TEMPLATE);
    expect(text(join(d, 'two.paged.html'))).toBe(assemble(two, { delivery: 'cdn' }));
    // no file: the text on stdout (and in --json)
    const s = await cli(['new', '--title', 'Out'], d);
    expect(s.code).toBe(0);
    expect(readHeader(s.stdout)!.fields['title']).toBe('Out');
    expect(lintHeader(s.stdout, 'paged')).toEqual([]);
    const sj = json(await cli(['new', '--json'], d));
    expect(sj.file).toBeNull();
    // `theme` as written (none), `themeEffective` the theme the pages use (the default)
    expect([sj.theme, sj.themeEffective]).toEqual([null, DEFAULT_THEME]);
    expect(DEFAULT_THEME).toBe('light-academic-1');
    // --title also replaces the template's placeholder title in its title element and running header (N.6)
    const rt = json(await cli(['new', '--template', 'report-page', '--title', 'Q4 Review', '--json'], d));
    expect(readHeader(rt.text as string)!.fields['header_center']).toBe('Q4 Review');
    expect(rt.text as string).toMatch(/kind: report-title\ntitle: Q4 Review\n/);
    expect(readHeader(sj.text as string)!.fields['carrier']).toBe('paged');
    // refusals: an existing file (untouched), a bad theme or template, another kind's name, a name that is not a paged twin, --html without a file
    const before = bytes(join(d, 'exam.paged.md'));
    const again = await cli(['new', 'exam.paged.md', '--json'], d);
    expect(again.code).toBe(1);
    expect(json(again)).toMatchObject({ ok: false, command: 'new' });
    expect(String(json(again).error)).toMatch(/already exists.*--force/);
    expect(json(again).reason).toBe('exists');
    expect(bytes(join(d, 'exam.paged.md')).equals(before)).toBe(true);
    // --force keeps every replaced file as <file>~ (round 2, F2): the text twin and, with --html, its file
    const beforeHtml = bytes(join(d, 'exam.paged.html'));
    const forced = await cli(['new', 'exam.paged.md', '--html', '--force', '--json'], d);
    expect(forced.code, forced.stdout).toBe(0);
    expect(json(forced).backups).toEqual([join(d, 'exam.paged.md~'), join(d, 'exam.paged.html~')]);
    expect(bytes(join(d, 'exam.paged.md')).equals(before)).toBe(false);
    expect(bytes(join(d, 'exam.paged.md~')).equals(before)).toBe(true);
    expect(bytes(join(d, 'exam.paged.html~')).equals(beforeHtml)).toBe(true);
    expect((json(forced).warnings as string[]).join('\n')).toMatch(/kept as .*exam\.paged\.md~[\s\S]*kept as .*exam\.paged\.html~/);
    const bad = await cli(['new', 'bad.paged.md', '--theme', 'dark-elegant-1'], d);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/unknown theme.*light-academic-1/);
    expect(existsSync(join(d, 'bad.paged.md'))).toBe(false);
    const badT = await cli(['new', 'bad.paged.md', '--template', 'thesis'], d);
    expect(badT.code).toBe(2);
    expect(badT.stderr).toMatch(/unknown template "thesis".*templates: article-page.*orz-paged templates/);
    expect((await cli(['new', 'bad.paged.md', '--measure', 'wide'], d)).code).toBe(2);
    expect((await cli(['new', 'deck.slides.md'], d)).stderr).toMatch(/orz-slides/);
    const plain = await cli(['new', 'notes.md'], d);
    expect(plain.code).toBe(2);
    expect(plain.stderr).toMatch(/ends in \.paged\.md \(e\.g\. notes\.paged\.md\)/);
    expect((await cli(['new', 'notes.txt'], d)).code).toBe(2);
    expect((await cli(['new', '--html'], d)).code).toBe(2);
    // a legacy template name resolves (0.x `article` → article-section)
    expect((await cli(['new', 'legacy-name.paged.md', '--template', 'article'], d)).code).toBe(0);
    expect(readHeader(text(join(d, 'legacy-name.paged.md')))!.fields['template']).toBe('article-section');
    noTemp(d);
  }, 240_000);

  it('[T.3] extract writes the exact text twin (new → CR LF + BOM on disk → assemble → extract: byte for byte); a 0.x file is refused with upgrade advice', async () => {
    const d = folder();
    expect((await cli(['new', 'doc.paged.md', '--title', 'Round trip'], d)).code).toBe(0);
    // the author's editor saved it with CR LF and a BOM
    const crlf = `\uFEFF${text(join(d, 'doc.paged.md')).replace(/\n/g, '\r\n')}`;
    write(join(d, 'doc.paged.md'), crlf);
    const original = bytes(join(d, 'doc.paged.md'));
    expect(original.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);
    for (const delivery of [[], ['--cdn']]) {
      expect((await cli(['assemble', 'doc.paged.md', '--force', ...delivery], d)).code).toBe(0);
      rmSync(join(d, 'doc.paged.md'));
      const r = await cli(['extract', 'doc.paged.html', '--json'], d);
      expect(r.code, r.stdout).toBe(0);
      expect(bytes(join(d, 'doc.paged.md')).equals(original)).toBe(true);
      expect(json(r)).toMatchObject({ ok: true, command: 'extract', output: join(d, 'doc.paged.md'), kind: 'paged', format: 1, shell: VERSION, delivery: delivery.length ? 'cdn' : 'inline', title: 'Round trip', includes: 0, bytes: original.length, warnings: [] });
    }
    // -o elsewhere and -o - (stdout), the text exact
    expect((await cli(['extract', 'doc.paged.html', '-o', 'copy.paged.md'], d)).code).toBe(0);
    expect(bytes(join(d, 'copy.paged.md')).equals(original)).toBe(true);
    expect((await cliBytes(['extract', 'doc.paged.html', '-o', '-'], d)).equals(original)).toBe(true);
    // includes come back as the file holds them (and the text exact)
    write(join(d, 'inc.paged.html'), assemble(HAZARDS['crlf-header']!, { includes: { './a.paged.md': 'A\r\n' } }));
    const inc = await cli(['extract', 'inc.paged.html', '--json'], d);
    expect(json(inc).includes).toBe(1);
    expect(text(join(d, 'inc.paged.md')) === HAZARDS['crlf-header']).toBe(true);
    // a 0.x file: refused, advice to upgrade, nothing written
    for (const [name, path] of Object.entries(LEGACY_FILES)) {
      const file = join(d, `legacy-${name.replace(/\W+/g, '-')}.paged.html`);
      write(file, read(path));
      const r = await cli(['extract', file], d);
      expect(r.code, name).toBe(1);
      expect(r.stderr).toMatch(/before text format 1.*orz-paged upgrade/);
      expect(existsSync(file.replace(/\.html$/, ''))).toBe(false);
    }
    // an island without #orz-shell (an unknown writer): extracted with a warning
    write(join(d, 'foreign.paged.html'), '<!doctype html><html><body><script type="text/markdown" id="orz-src"># foreign\n</script></body></html>');
    const foreign = await cli(['extract', 'foreign.paged.html', '--json'], d);
    expect(foreign.code).toBe(0);
    expect((json(foreign).warnings as string[]).join('\n')).toMatch(/no #orz-shell: an unknown writer/);
    expect(text(join(d, 'foreign.paged.md'))).toBe('# foreign\n');
    // a file cut off inside its island: extracted (exit 0) with a warning that the text may be incomplete
    const whole = assemble('# Cut\n\nfirst part\n\nsecond part\n', { delivery: 'cdn' });
    write(join(d, 'cut.paged.html'), whole.slice(0, whole.indexOf('second part') + 6));
    const cut = await cli(['extract', 'cut.paged.html', '--json'], d);
    expect(cut.code).toBe(0);
    expect((json(cut).warnings as string[]).join('\n')).toMatch(/cut off.*may be incomplete/);
    const cutHuman = await cli(['extract', 'cut.paged.html', '-o', 'cut2.paged.md'], d);
    expect(cutHuman.stderr).toMatch(/warning: .*cut off/);
    // not an orz file
    write(join(d, 'plain.paged.html'), '<!doctype html><title>x</title><p>hello</p>');
    const plain = await cli(['extract', 'plain.paged.html', '--json'], d);
    expect(plain.code).toBe(1);
    expect(json(plain)).toMatchObject({ ok: false, command: 'extract' });
    noTemp(d);
  }, 240_000);

  it('[T.4] upgrade writes a 0.x file\'s new file in place and its text twin (= the library\'s upgrade), keeps its delivery, re-assembles an older format-1 shell; refuses a different existing twin', async () => {
    const d = folder();
    for (const [name, path] of Object.entries(LEGACY_FILES)) {
      const old = read(path);
      const base = `old-${name.replace(/\W+/g, '-')}`;
      const file = join(d, `${base}.paged.html`);
      write(file, old);
      const r = await cli(['upgrade', `${base}.paged.html`, '--json'], d);
      expect(r.code, r.stdout).toBe(0);
      const j = json(r);
      const twin = text(join(d, `${base}.paged.md`));
      const lib = upgrade(old, { uid: j.uid as string, delivery: j.delivery as 'inline' | 'cdn' });
      expect(twin === lib.text, name).toBe(true);
      expect(text(file) === lib.html, name).toBe(true);
      expect(extract(text(file))!.text === twin).toBe(true);
      expect(j).toMatchObject({ ok: true, command: 'upgrade', input: file, output: file, text: join(d, `${base}.paged.md`), from: 'legacy', shell: VERSION, moved: lib.moved, notes: lib.notes });
      expect(j.delivery).toBe(readLegacy(old)!.delivery ?? 'inline');
      expect(inspect(text(file)).input).toBe('assembled');
      // twice: a format-1 file of this shell, the text unchanged
      const again = await cli(['upgrade', `${base}.paged.html`, '--inline', '--json'], d);
      expect(again.code, again.stdout).toBe(0);
      expect(json(again).from).toBe('format-1');
      expect(text(file) === assemble(twin)).toBe(true);
    }
    // an older format-1 shell is re-assembled with this one (text and includes unchanged)
    const t = HAZARDS['bom-crlf']!;
    const older = assemble(t, { delivery: 'cdn', includes: { './x.paged.md': 'X\n' } }).split(`"shell":"${VERSION}"`).join('"shell":"0.0.1"');
    expect(extract(older)!.shell).toBe('0.0.1');
    write(join(d, 'older.paged.html'), older);
    const o = await cli(['upgrade', 'older.paged.html', '-o', 'newer.paged.html', '--text', 'newer-text.paged.md', '--json'], d);
    expect(o.code, o.stdout).toBe(0);
    expect(json(o)).toMatchObject({ from: 'format-1', previous: '0.0.1', delivery: 'cdn' });
    expect(text(join(d, 'newer.paged.html'))).toBe(assemble(t, { delivery: 'cdn', includes: { './x.paged.md': 'X\n' } }));
    expect(text(join(d, 'newer-text.paged.md')) === t).toBe(true);
    expect(text(join(d, 'older.paged.html'))).toBe(older); // -o: the input is left alone
    // an existing, different text twin: refused before anything is written
    const legacy = read(LEGACY_FILES['sample']!);
    write(join(d, 'kept.paged.html'), legacy);
    write(join(d, 'kept.paged.md'), '# my own newer text\n');
    const refused = await cli(['upgrade', 'kept.paged.html'], d);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/kept\.paged\.md exists and holds a different text/);
    expect(text(join(d, 'kept.paged.html'))).toBe(legacy);
    expect(text(join(d, 'kept.paged.md'))).toBe('# my own newer text\n');
    expect((await cli(['upgrade', 'kept.paged.html', '--no-text'], d)).code).toBe(0);
    expect(text(join(d, 'kept.paged.md'))).toBe('# my own newer text\n');
    expect(inspect(text(join(d, 'kept.paged.html'))).input).toBe('assembled');
    // not an orz file
    write(join(d, 'plain.html'), '<!doctype html><p>x</p>');
    expect((await cli(['upgrade', 'plain.html', '--no-text'], d)).code).toBe(1);
    noTemp(d);
  }, 240_000);

  it('[T.5] inspect is human-readable by default (golden) and --json prints the library\'s inspect report', async () => {
    const d = folder();
    const files: Array<[string, string]> = [
      ...Object.entries(LEGACY_FILES).map(([k, p]) => [`legacy-${k.replace(/\W+/g, '-')}.paged.html`, read(p)] as [string, string]),
      ['assembled.paged.html', assemble(HAZARDS['crlf-header']!, { delivery: 'cdn', includes: { './a.paged.md': 'A\n' } })],
      ['twin.paged.md', HAZARDS['crlf-header']!],
      ['deck.slides.md', '# a slide\n'],
      ['page.html', '<!doctype html><title>x</title>'],
    ];
    for (const [name, content] of files) {
      write(join(d, name), content);
      const r = await cli(['inspect', name, '--json'], d);
      expect(r.code, name).toBe(0);
      expect(json(r), name).toEqual(JSON.parse(JSON.stringify(inspect(content, { filename: name }))));
      const h = await cli(['inspect', name], d);
      expect(h.code).toBe(0);
      expect(h.stdout).toMatch(new RegExp(`^file\\s+${name.replace(/\./g, '\\.')}\\ninput\\s+`));
    }
    const human = (await cli(['inspect', 'legacy-sample.paged.html'], d)).stdout;
    expect(goldenLegacy(human)).toBe(read(`${GOLDEN}/inspect-legacy.txt`));
    expect(golden((await cli(['inspect', 'assembled.paged.html'], d)).stdout)).toBe(read(`${GOLDEN}/inspect-assembled.txt`));
  }, 240_000);

  it('[T.6] every command answers --help, -h and help <command>; --version (and --json); themes marks the default', async () => {
    const d = folder();
    await Promise.all(['new', 'assemble', 'extract', 'upgrade', 'inspect', 'themes', 'templates'].flatMap((c) => [[c, '--help'], [c, '-h'], ['help', c]].map(async (args) => {
      const r = await cli(args, d);
      expect(r.code, args.join(' ')).toBe(0);
      expect(r.stdout.startsWith(`orz-paged ${c} `), args.join(' ')).toBe(true);
    })));
    const help = await cli(['--help'], d);
    expect(help.code).toBe(0);
    expect(golden(help.stdout)).toBe(read(`${GOLDEN}/help.txt`));
    const none = await cli([], d);
    expect(none.code).toBe(2);
    expect(none.stderr).toContain('Usage:');
    expect((await cli(['--version'], d)).stdout).toBe(`orz-paged ${VERSION} (orz-markdown ${ORZ_MARKDOWN_VERSION}, text format 1)\n`);
    expect(json(await cli(['--version', '--json'], d))).toEqual({ name: 'orz-paged', version: VERSION, orzMarkdown: ORZ_MARKDOWN_VERSION, formats: [1] });
    const themes = json(await cli(['themes', '--json'], d)).themes as Array<{ id: string; default: boolean }>;
    expect(themes).toEqual(THEME_INFO.map((t) => ({ id: t.id, label: t.label, source: t.source, default: t.id === DEFAULT_THEME })));
    expect(themes.filter((t) => t.default).map((t) => t.id)).toEqual([DEFAULT_THEME]);
    expect((await cli(['themes'], d)).stdout).toMatch(new RegExp(`^${DEFAULT_THEME} .*\\[default\\]$`, 'm'));
    const templates = json(await cli(['templates', '--json'], d)).templates as Array<{ id: string; default: boolean }>;
    expect(templates).toEqual(TEMPLATES.map((t) => ({ ...t, default: t.id === DEFAULT_TEMPLATE })));
    const tl = (await cli(['templates'], d)).stdout;
    for (const t of TEMPLATES) expect(tl).toContain(`  ${t.id} `);
    expect(tl).toMatch(new RegExp(`^  ${DEFAULT_TEMPLATE} .*\\[default\\]$`, 'm'));
    expect(tl).toMatch(/^Exam:$/m);
  }, 240_000);

  it('[T.6] failures exit 1 (missing, non-UTF-8, a newer format, an assembled input) or 2 (usage) with one JSON object; assemble has no content options (a clear message, nothing written)', async () => {
    const d = folder();
    // failures: 1 (missing file, refused), 2 (usage); --json gives {ok: false} on stdout
    const missing = await cli(['assemble', 'nope.paged.md', '--json'], d);
    expect(missing.code).toBe(1);
    expect(json(missing)).toEqual({ ok: false, command: 'assemble', error: `${join(d, 'nope.paged.md')}: no such file`, reason: 'no-such-file', exitCode: 1 });
    expect((await cli(['extract', 'nope.paged.html'], d)).code).toBe(1);
    expect((await cli(['inspect', 'nope'], d)).code).toBe(1);
    write(join(d, 'doc.paged.md'), '# Doc\n');
    write(join(d, 'bad-utf8.paged.md'), '');
    writeFileSync(join(d, 'bad-utf8.paged.md'), Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a]));
    expect((await cli(['assemble', 'bad-utf8.paged.md'], d)).stderr).toMatch(/not valid UTF-8/);
    const unknown = await cli(['assemble', 'doc.paged.md', '--frobnicate', '--json'], d);
    expect(unknown.code).toBe(2);
    expect(json(unknown)).toMatchObject({ ok: false, exitCode: 2 });
    expect((await cli(['assemble', 'doc.paged.md', 'other.paged.md'], d)).code).toBe(2);
    expect((await cli(['assemble', 'doc.paged.md', '--cdn', '--inline'], d)).code).toBe(2);
    expect((await cli(['assemble', 'doc.paged.md', '-o'], d)).code).toBe(2);
    // content options are gone from assemble: a clear message, exit 2, nothing written
    for (const [flag, value] of [['--theme', 'light-neat-1'], ['--title', 'T'], ['--page-size', 'A5'], ['--lang', 'de']]) {
      for (const args of [['assemble', 'doc.paged.md', flag!, value!], ['doc.paged.md', flag!, value!]]) {
        const r = await cli(args, d);
        expect(r.code, args.join(' ')).toBe(2);
        expect(r.stderr).toContain(`${flag} is not an assemble option`);
        expect(r.stderr).toMatch(/header/);
        expect(existsSync(join(d, 'doc.paged.html'))).toBe(false);
      }
    }
    // an assembled file given to assemble, another kind, a header saying another carrier without a name
    expect((await cli(['assemble', 'doc.paged.md'], d)).code).toBe(0);
    expect((await cli(['assemble', 'doc.paged.html'], d)).stderr).toMatch(/is an assembled file.*extract/);
    write(join(d, 'deck.slides.md'), '# s\n');
    expect((await cli(['assemble', 'deck.slides.md'], d)).stderr).toMatch(/orz-slides/);
    // a plain Markdown text (the 0.x habit) assembles to x.paged.html; a header naming another carrier is refused
    write(join(d, 'plain.md'), '# Plain\n');
    const plain = await cli(['plain.md', '--json'], d);
    expect(plain.code, plain.stdout).toBe(0);
    expect(json(plain)).toMatchObject({ output: join(d, 'plain.paged.html'), kind: 'paged' });
    write(join(d, 'web.md'), '{{nyml\nkind: document\ncarrier: md\n}}\n\n# Web\n');
    const web = await cli(['web.md', '--json'], d);
    expect(json(web)).toMatchObject({ ok: false, reason: 'other-kind' });
    expect(String(json(web).error)).toMatch(/carrier: md; use orz-mdhtml/);
    expect(existsSync(join(d, 'web.paged.html'))).toBe(false);
    write(join(d, 'noext'), '# x\n');
    expect((await cli(['assemble', 'noext'], d)).code).toBe(2);
    expect((await cli(['assemble', 'noext', '-o', 'noext.paged.html'], d)).code).toBe(0);
    // a newer text format is refused
    write(join(d, 'newer.paged.md'), '{{nyml\nkind: document\nformat: 2\n}}\n\nx\n');
    const newer = await cli(['assemble', 'newer.paged.md', '--json'], d);
    expect(newer.code).toBe(1);
    expect(String(json(newer).error)).toMatch(/format/);
    // header lint warnings are reported, the file still written
    write(join(d, 'lint.paged.md'), '{{nyml\nkind: document\nuid: not-a-uid\n}}\n\nx\n');
    const lint = await cli(['assemble', 'lint.paged.md', '--json'], d);
    expect(lint.code).toBe(0);
    expect((json(lint).warnings as string[]).length).toBeGreaterThan(0);
  }, 240_000);

  it('[T.7] nothing is overwritten that could lose work unless --force (which keeps <file>~): assemble keeps a non-orz output and a .paged.html holding a different text — however the times compare; extract keeps a newer, different twin; the output never replaces the input', async () => {
    const d = folder();
    write(join(d, 'a.paged.md'), '# A\n');
    // a non-orz output
    write(join(d, 'a.paged.html'), '<!doctype html><p>someone else\'s page</p>');
    const r1 = await cli(['assemble', 'a.paged.md'], d);
    expect(r1.code).toBe(1);
    expect(r1.stderr).toMatch(/not an orz file/);
    expect(text(join(d, 'a.paged.html'))).toMatch(/someone else/);
    const f1 = await cli(['assemble', 'a.paged.md', '--force', '--json'], d);
    expect(f1.code).toBe(0);
    expect(text(join(d, 'a.paged.html'))).toBe(assemble('# A\n'));
    expect(text(join(d, 'a.paged.html~'))).toMatch(/someone else/); // the replaced file is kept
    expect(json(f1)).toMatchObject({ backup: join(d, 'a.paged.html~') });
    expect((json(f1).warnings as string[]).join('\n')).toMatch(/kept as .*a\.paged\.html~/);

    // the agent workflow (round 1, HIGH): new --html; a browser save adds text to the file; the agent edits the
    // text twin afterwards (so the twin is the NEWER file); assemble must not throw the browser's work away
    const w = folder();
    expect((await cli(['new', 'doc.paged.md', '--html'], w)).code).toBe(0);
    const made = text(join(w, 'doc.paged.md'));
    write(join(w, 'doc.paged.html'), assemble(`${made}\nBROWSER WORK\n`));
    touch(join(w, 'doc.paged.html'), 1_700_000_100);
    write(join(w, 'doc.paged.md'), `${made}\nagent line\n`);
    touch(join(w, 'doc.paged.md'), 1_700_000_200);
    const insp = json(await cli(['inspect', 'doc.paged.md', '--json'], w));
    expect(insp.twin).toEqual({ name: 'doc.paged.html', holds: 'different', newer: 'input', sha256: sha256(extract(text(join(w, 'doc.paged.html')))!.text) });
    expect((insp.advice as string[]).join('\n')).toMatch(/doc\.paged\.html holds a different text.*orz-paged extract doc\.paged\.html/);
    const refused = await cli(['assemble', 'doc.paged.md', '--json'], w);
    expect(refused.code).toBe(1);
    expect(String(json(refused).error)).toMatch(/doc\.paged\.html holds a different text than doc\.paged\.md — not its last commit, nor the text orz-paged last wrote there; not replaced.*orz-paged extract doc\.paged\.html -o doc\.browser\.paged\.md.*--force.*doc\.paged\.html~/);
    expect(extract(text(join(w, 'doc.paged.html')))!.text).toContain('BROWSER WORK');
    // the way out the message names: extract, merge, assemble --force (the old file kept)
    expect((await cli(['extract', 'doc.paged.html', '-o', 'doc.browser.paged.md'], w)).code).toBe(0);
    expect(text(join(w, 'doc.browser.paged.md'))).toContain('BROWSER WORK');
    const merged = `${made}\nBROWSER WORK\n\nagent line\n`;
    write(join(w, 'doc.paged.md'), merged);
    expect((await cli(['assemble', 'doc.paged.md', '--force'], w)).code).toBe(0);
    expect(extract(text(join(w, 'doc.paged.html')))!.text).toBe(merged);
    expect(extract(text(join(w, 'doc.paged.html~')))!.text).toContain('BROWSER WORK');
    // in step again: assembling the same text needs nothing (whatever the times)
    touch(join(w, 'doc.paged.html'), 1_700_000_900);
    expect((await cli(['assemble', 'doc.paged.md'], w)).code).toBe(0);
    // the browser-newer case is refused as before; doc.paged.md is the CLI's own unchanged state, so the way out is a plain extract (round 3, L2)
    const B1 = `${made}\n# edited in the browser\n`; // a browser save keeps the document's uid
    write(join(w, 'doc.paged.html'), assemble(B1));
    touch(join(w, 'doc.paged.md'), 1_700_001_000);
    touch(join(w, 'doc.paged.html'), 1_700_001_100);
    const r2 = await cli(['assemble', 'doc.paged.md', '--json'], w);
    expect(r2.code).toBe(1);
    expect(json(r2)).toMatchObject({ reason: 'twin-differs', next: { command: 'extract', args: ['doc.paged.html'] } });
    expect(String(json(r2).error)).toMatch(/holds a different text than doc\.paged\.md, and doc\.paged\.md is unchanged since orz-paged last synced the pair.*`orz-paged extract doc\.paged\.html` brings it into doc\.paged\.md/);
    expect((await cli(['extract', 'doc.paged.html', '--json'], w)).code).toBe(0); // following next verbatim
    expect(text(join(w, 'doc.paged.md'))).toBe(B1);
    // an edited doc.paged.md and a newer browser save: the mtime hint (the files are not clean in git)
    write(join(w, 'doc.paged.html'), assemble(`${B1}again\n`));
    write(join(w, 'doc.paged.md'), `${B1}\nagent\n`);
    touch(join(w, 'doc.paged.md'), 1_700_002_000);
    touch(join(w, 'doc.paged.html'), 1_700_002_100);
    const r2b = await cli(['assemble', 'doc.paged.md', '--json'], w);
    expect(String(json(r2b).error)).toMatch(/holds a different text than doc\.paged\.md and was changed after it.*orz-paged extract doc\.paged\.html -o doc\.browser-2\.paged\.md/); // doc.browser.paged.md exists: a free name
    noTemp(w);

    // mixed line endings are stored in one style: assembling twice is not a "different text" (round 1, A#4)
    const e = folder();
    writeFileSync(join(e, 'm.paged.md'), 'a\r\nb\nc\n');
    expect((await cli(['assemble', 'm.paged.md'], e)).code).toBe(0);
    const again = await cli(['assemble', 'm.paged.md', '--json'], e);
    expect(again.code, again.stdout).toBe(0);
    expect(json(again).backup).toBeNull();
    expect(extract(text(join(e, 'm.paged.html')))!.text).toBe('a\r\nb\r\nc\r\n');

    // extract keeps a text twin that differs and is not a known state — WHICHEVER file is newer (round 2, HIGH)
    write(join(d, 'a.paged.html'), assemble('# A from the browser\n'));
    write(join(d, 'a.paged.md'), '# A edited as text\n');
    touch(join(d, 'a.paged.html'), 1_700_000_400);
    touch(join(d, 'a.paged.md'), 1_700_000_500);
    const r3 = await cli(['extract', 'a.paged.html'], d);
    expect(r3.code).toBe(1);
    expect(r3.stderr).toMatch(/a\.paged\.md exists and holds a different text, changed after a\.paged\.html.*not overwritten.*orz-paged extract a\.paged\.html -o a\.browser\.paged\.md/);
    expect(text(join(d, 'a.paged.md'))).toBe('# A edited as text\n');
    touch(join(d, 'a.paged.md'), 1_700_000_300); // the twin is now the OLDER file: still refused (an mtime proves nothing)
    const r4 = await cli(['extract', 'a.paged.html', '--json'], d);
    expect(r4.code).toBe(1);
    expect(json(r4)).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'extract', args: ['a.paged.html', '-o', 'a.browser.paged.md'] } });
    expect(text(join(d, 'a.paged.md'))).toBe('# A edited as text\n');
    expect((await cli(['extract', 'a.paged.html', '--force'], d)).code).toBe(0);
    expect(text(join(d, 'a.paged.md'))).toBe('# A from the browser\n');
    expect(text(join(d, 'a.paged.md~'))).toBe('# A edited as text\n');

    // the round-2 repro: new --html; the agent appends to x.paged.md; the browser saves x.paged.html; assemble refuses and
    // names extract -o x.browser.paged.md; a plain extract must not overwrite the agent's x.paged.md (it did: ok, no backup)
    const x = folder();
    expect((await cli(['new', 'x.paged.md', '--html'], x)).code).toBe(0);
    const base = text(join(x, 'x.paged.md'));
    write(join(x, 'x.paged.md'), `${base}agent line\n`);
    write(join(x, 'x.paged.html'), assemble(`${base}browser line\n`));
    const refusedAssemble = await cli(['assemble', 'x.paged.md', '--json'], x);
    expect(json(refusedAssemble)).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'extract', args: ['x.paged.html', '-o', 'x.browser.paged.md'] } });
    const refusedExtract = await cli(['extract', 'x.paged.html', '--json'], x);
    expect(refusedExtract.code).toBe(1);
    expect(json(refusedExtract)).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'extract', args: ['x.paged.html', '-o', 'x.browser.paged.md'] } });
    expect(text(join(x, 'x.paged.md'))).toBe(`${base}agent line\n`);
    expect(existsSync(join(x, 'x.paged.md~'))).toBe(false);
    // the way out it names: extract to x.browser.paged.md, merge
    expect((await cli(['extract', 'x.paged.html', '-o', 'x.browser.paged.md'], x)).code).toBe(0);
    expect(text(join(x, 'x.browser.paged.md'))).toBe(`${base}browser line\n`);
    // an unchanged twin (the text orz-paged last wrote or read for the pair) is replaced without --force
    const y = folder();
    expect((await cli(['new', 'y.paged.md', '--html'], y)).code).toBe(0);
    const yBase = text(join(y, 'y.paged.md'));
    write(join(y, 'y.paged.html'), assemble(`${yBase}saved in the browser\n`));
    const pulled = await cli(['extract', 'y.paged.html', '--json'], y);
    expect(pulled.code, pulled.stdout).toBe(0);
    expect(json(pulled)).toMatchObject({ replaced: 'cache', backup: null });
    expect(text(join(y, 'y.paged.md'))).toBe(`${yBase}saved in the browser\n`);
    noTemp(x);
    // the output never replaces the input
    expect((await cli(['assemble', 'a.paged.md', '-o', 'a.paged.md'], d)).code).toBe(2);
    expect((await cli(['extract', 'a.paged.html', '-o', 'a.paged.html'], d)).code).toBe(2);
    noTemp(d);
  }, 240_000);

  it('[T.11] the smoother assemble rule: a .paged.html holding an earlier state of its twin — the text the CLI last wrote or read for the pair (new --html, assemble, extract, upgrade), or the twin\'s last commit, staged version or one of its recent commits in git — is replaced without --force; a browser save in between is still refused; mixed line endings compare as stored, with and without a cache; the cache lives under $XDG_CACHE_HOME', async () => {
    // after new --html: edit the twin, assemble — no --force, no backup
    const d = folder();
    expect((await cli(['new', 'doc.paged.md', '--html'], d)).code).toBe(0);
    const made = text(join(d, 'doc.paged.md'));
    write(join(d, 'doc.paged.md'), `${made}\nfirst edit\n`);
    const r1 = await cli(['assemble', 'doc.paged.md', '--json'], d);
    expect(r1.code, r1.stdout).toBe(0);
    expect(json(r1)).toMatchObject({ backup: null, replaced: 'cache' });
    expect(extract(text(join(d, 'doc.paged.html')))!.text).toBe(`${made}\nfirst edit\n`);
    expect(existsSync(join(d, 'doc.paged.html~'))).toBe(false);
    // after a previous assemble: again (the human output says why)
    write(join(d, 'doc.paged.md'), `${made}\nsecond edit\n`);
    const r2 = await cli(['assemble', 'doc.paged.md'], d);
    expect(r2.code, r2.stderr).toBe(0);
    expect(r2.stdout).toMatch(/it held an earlier text of doc\.paged\.md: the text orz-paged last wrote or read for this pair/);
    // inspect says so too
    write(join(d, 'doc.paged.md'), `${made}\nthird edit\n`);
    const insp = json(await cli(['inspect', 'doc.paged.md', '--json'], d));
    expect(insp.twin).toMatchObject({ name: 'doc.paged.html', holds: 'different', earlier: 'cache' });
    expect((insp.advice as string[]).join('\n')).toMatch(/doc\.paged\.html holds an earlier text of this text twin.*orz-paged assemble doc\.paged\.md`.*no --force needed/);
    expect((await cli(['assemble', 'doc.paged.md'], d)).code).toBe(0);
    // after extract (the CLI read the file): edit the twin, assemble
    write(join(d, 'doc.paged.html'), assemble(`${made}\nsaved in the browser\n`));
    touch(join(d, 'doc.paged.md'), 1_700_000_000);
    expect((await cli(['extract', 'doc.paged.html'], d)).code).toBe(0);
    write(join(d, 'doc.paged.md'), `${made}\nsaved in the browser\nthen edited as text\n`);
    expect((await cli(['assemble', 'doc.paged.md'], d)).code).toBe(0);
    expect(extract(text(join(d, 'doc.paged.html')))!.text).toBe(`${made}\nsaved in the browser\nthen edited as text\n`);
    // the cache is a record per pair under $XDG_CACHE_HOME/orz-paged (here the test's own), never the user's
    expect(readdirSync(join(CACHE, 'orz-paged', 'pairs')).length).toBeGreaterThan(0);

    // the HIGH repro: new --html, a browser save adds work to the file, the agent edits the twin → still refused
    const h = folder();
    expect((await cli(['new', 'doc.paged.md', '--html'], h)).code).toBe(0);
    const base = text(join(h, 'doc.paged.md'));
    write(join(h, 'doc.paged.html'), assemble(`${base}\nBROWSER WORK\n`));
    write(join(h, 'doc.paged.md'), `${base}\nagent line\n`);
    const refused = await cli(['assemble', 'doc.paged.md', '--json'], h);
    expect(refused.code).toBe(1);
    expect(String(json(refused).error)).toMatch(/holds a different text than doc\.paged\.md.*not replaced/);
    expect(extract(text(join(h, 'doc.paged.html')))!.text).toContain('BROWSER WORK');
    // a browser save that happens after an assemble: refused too (the record holds the CLI's text, not the browser's)
    write(join(h, 'doc.paged.md'), `${base}\nBROWSER WORK\n\nagent line\n`);
    expect((await cli(['assemble', 'doc.paged.md', '--force'], h)).code).toBe(0);
    write(join(h, 'doc.paged.html'), assemble(`${base}\nBROWSER WORK\n\nagent line\nmore browser work\n`));
    write(join(h, 'doc.paged.md'), `${base}\nBROWSER WORK\n\nagent line\nanother agent line\n`);
    expect((await cli(['assemble', 'doc.paged.md'], h)).code).toBe(1);
    // another cache (another user, a cleared cache): nothing is known, refused
    const fresh = folder();
    write(join(fresh, 'doc.paged.md'), '# A\n');
    expect((await cli(['assemble', 'doc.paged.md'], fresh)).code).toBe(0);
    write(join(fresh, 'doc.paged.md'), '# A\n\nedited\n');
    expect((await cli(['assemble', 'doc.paged.md'], fresh, { XDG_CACHE_HOME: join(fresh, 'other-cache') })).code).toBe(1);

    // upgrade records the pair (round 2, M06): upgrade a 0.x file, edit the text twin, assemble — no --force
    const u = folder();
    write(join(u, 'old.paged.html'), read(LEGACY_FILES['sample']!));
    expect((await cli(['upgrade', 'old.paged.html'], u)).code).toBe(0);
    write(join(u, 'old.paged.md'), `${text(join(u, 'old.paged.md'))}\nedited after the upgrade\n`);
    const afterUpgrade = await cli(['assemble', 'old.paged.md', '--json'], u);
    expect(afterUpgrade.code, afterUpgrade.stdout).toBe(0);
    expect(json(afterUpgrade)).toMatchObject({ replaced: 'cache', backup: null });

    // mixed line endings (round 2, M08/M09): the record holds the STORED text (one style), so assembling an edited
    // mixed text after a mixed one needs nothing; and the same text assembles twice with no cache at all
    const m = folder();
    writeFileSync(join(m, 'm.paged.md'), 'a\r\nb\nc\n');
    expect((await cli(['assemble', 'm.paged.md'], m)).code).toBe(0);
    writeFileSync(join(m, 'm.paged.md'), 'a\r\nb\nc\nd\n');
    const mixed = await cli(['assemble', 'm.paged.md', '--json'], m);
    expect(mixed.code, mixed.stdout).toBe(0);
    expect(json(mixed)).toMatchObject({ replaced: 'cache' });
    for (const env of [{ XDG_CACHE_HOME: join(m, 'empty-1') }, { XDG_CACHE_HOME: join(m, 'empty-2') }]) {
      const again = await cli(['assemble', 'm.paged.md', '--json'], m, env); // a fresh cache each run: only the same-text rule can allow it
      expect(again.code, again.stdout).toBe(0);
      expect(json(again)).toMatchObject({ replaced: null, backup: null });
    }

    // git: a file holding the twin's last commit (or its staged version) is replaced without --force — with no cache at all
    const g = folder();
    const git = (...args: string[]): Promise<Run> => new Promise((res) => execFile('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd: g }, (e, stdout, stderr) => res({ code: e ? 1 : 0, stdout, stderr })));
    if ((await git('init', '-q')).code !== 0) return; // no git on this machine: nothing more to show
    let caches = 0;
    const noCache = (): NodeJS.ProcessEnv => ({ XDG_CACHE_HOME: join(tmp, `.empty-cache-${++caches}`) }); // a fresh, empty cache each run: only git can know
    // uid'd: the twin is replaced as a known state only when both texts carry the same uid (G1: a uid-less one is refused, T.21)
    const HG = '{{nyml\nkind: document\ncarrier: paged\nuid: doc-t11git000001\ntitle: Committed\n}}\n\n';
    write(join(g, 'doc.paged.md'), HG + '# Committed\r\n\nline\n'); // mixed line endings: compared as a file stores them
    expect((await git('add', 'doc.paged.md')).code).toBe(0);
    expect((await git('commit', '-q', '-m', 'doc')).code).toBe(0);
    write(join(g, 'doc.paged.html'), assemble(HG + '# Committed\r\n\nline\n')); // assembled by anyone (no record)
    write(join(g, 'doc.paged.md'), HG + '# Committed\r\n\nline\nedited after the commit\n');
    const c1 = await cli(['assemble', 'doc.paged.md', '--json'], g, noCache());
    expect(c1.code, c1.stdout).toBe(0);
    expect(json(c1)).toMatchObject({ backup: null, replaced: 'git-head' });
    // the staged version counts too
    expect((await git('add', 'doc.paged.md')).code).toBe(0);
    write(join(g, 'doc.paged.md'), HG + '# Committed\r\n\nline\nedited after the commit\nand after staging\n');
    const c2 = await cli(['assemble', 'doc.paged.md', '--json'], g, noCache());
    expect(c2.code, c2.stdout).toBe(0);
    expect(json(c2)).toMatchObject({ replaced: 'git-index' });
    // a browser save on top of the committed state: neither commit, index nor record → refused
    write(join(g, 'doc.paged.html'), assemble(HG + '# Committed\r\n\nline\nBROWSER WORK\n'));
    write(join(g, 'doc.paged.md'), HG + '# Committed\r\n\nline\nagent work\n');
    expect((await cli(['assemble', 'doc.paged.md'], g, noCache())).code).toBe(1);
    expect(extract(text(join(g, 'doc.paged.html')))!.text).toContain('BROWSER WORK');
    // a fresh clone (no cache): the file holds an OLDER commit's text of doc.paged.md (round 2, F4: git log -n 20 -- doc.paged.md)
    expect((await git('commit', '-q', '-m', 'second')).code).toBe(0); // the staged version becomes a commit
    write(join(g, 'doc.paged.md'), HG + '# Committed\r\n\nline\nthird version\n');
    expect((await git('commit', '-q', '-am', 'third')).code).toBe(0);
    write(join(g, 'doc.paged.html'), assemble(HG + '# Committed\r\n\nline\n')); // the first commit's text
    write(join(g, 'doc.paged.md'), HG + '# Committed\r\n\nline\nthird version\nand an edit\n');
    const c3 = await cli(['assemble', 'doc.paged.md', '--json'], g, noCache());
    expect(c3.code, c3.stdout).toBe(0);
    expect(json(c3)).toMatchObject({ backup: null, replaced: 'git-log' });
    // extract: a twin whose text is a committed version is replaced without --force (its content is in the history)
    write(join(g, 'doc.paged.html'), assemble(HG + '# Committed\r\n\nline\nthird version\nBROWSER\n'));
    write(join(g, 'doc.paged.md'), HG + '# Committed\r\n\nline\nthird version\n'); // = HEAD
    const e1 = await cli(['extract', 'doc.paged.html', '--json'], g, noCache());
    expect(e1.code, e1.stdout).toBe(0);
    expect(json(e1)).toMatchObject({ replaced: 'git-head', backup: null });
    write(join(g, 'doc.paged.md'), HG + '# Committed\r\n\nline\n'); // = an older commit
    expect(json(await cli(['extract', 'doc.paged.html', '--json'], g, noCache()))).toMatchObject({ ok: true, replaced: 'git-log' });
    write(join(g, 'doc.paged.md'), HG + '# Committed\r\n\nline\nnever committed\n');
    expect((await cli(['extract', 'doc.paged.html'], g, noCache())).code).toBe(1);
    noTemp(g);
  }, 240_000);

  it('[T.8] assemble keeps the includes the existing file holds (unless --no-includes), --resolve-includes reads file includes from the text\'s folder only, and each unresolved directive is warned about once (the "Included file not available" note; the hint depends on --resolve-includes) and listed in --json unresolved', async () => {
    const d = folder();
    mkdirSync(join(d, 'parts'));
    write(join(d, 'parts', 'a.paged.md'), 'PART A\r\n');
    write(join(d, 'outside.paged.md'), 'OUTSIDE\n');
    const doc = '# Doc\n\n{{md parts/a.paged.md}}\n\n{{md https://example.test/b.paged.md}}\n';
    write(join(d, 'doc.paged.md'), doc);
    // the existing file's record (a host or the library resolved them): kept by a plain assemble
    write(join(d, 'doc.paged.html'), assemble(doc, { includes: { 'parts/a.paged.md': 'OLD A\n', 'https://example.test/b.paged.md': 'URL B\n', './gone.paged.md': 'no longer included\n' } }));
    const kept = await cli(['assemble', 'doc.paged.md', '--json'], d);
    expect(kept.code, kept.stdout).toBe(0);
    expect(extract(text(join(d, 'doc.paged.html')))!.includes).toEqual({ 'parts/a.paged.md': 'OLD A\n', 'https://example.test/b.paged.md': 'URL B\n' }); // a removed directive's entry goes
    // parts/a.paged.md in the folder differs from the record: kept, but reported stale with the command that refreshes it (round 3, M2)
    expect(json(kept)).toMatchObject({ includes: 2, resolved: 0, unresolved: [], stale: [{ target: 'parts/a.paged.md', kind: 'file', reason: 'stale-record' }] });
    expect(json(kept).warnings).toEqual([expect.stringMatching(/\{\{md parts\/a\.paged\.md\}\} is stale \(stale-record\).*`orz-paged assemble doc\.paged\.md --resolve-includes`/)]);
    // --resolve-includes: the file include is read afresh from the folder (exact text), the URL entry kept
    const res = await cli(['assemble', 'doc.paged.md', '--resolve-includes', '--json'], d);
    expect(res.code, res.stdout).toBe(0);
    expect(extract(text(join(d, 'doc.paged.html')))!.includes).toEqual({ 'parts/a.paged.md': 'PART A\r\n', 'https://example.test/b.paged.md': 'URL B\n' });
    expect(json(res)).toMatchObject({ includes: 2, resolved: 1 });
    expect(text(join(d, 'doc.paged.html'))).toBe(assemble(doc, { includes: { 'https://example.test/b.paged.md': 'URL B\n', 'parts/a.paged.md': 'PART A\r\n' } }));
    // --no-includes drops the record: both directives are reported unresolved
    const none = await cli(['assemble', 'doc.paged.md', '--no-includes', '--json'], d);
    expect(none.code).toBe(0);
    expect(extract(text(join(d, 'doc.paged.html')))!.includes).toBeUndefined();
    const warned = (json(none).warnings as string[]).join('\n');
    expect(warned).toMatch(/\{\{md parts\/a\.paged\.md\}\} is not resolved: the file shows an "Included file not available" note there \(pass --resolve-includes to read it from the text's folder: `orz-paged assemble doc\.paged\.md --resolve-includes`\)/);
    expect(warned).toMatch(/\{\{md https:\/\/example\.test\/b\.paged\.md\}\} is not resolved: the file shows an "Included file not available" note there.*URL include/);
    expect(warned).not.toMatch(/shows nothing/);
    expect(json(none).unresolved).toEqual([{ target: 'parts/a.paged.md', kind: 'file', reason: 'not-recorded' }, { target: 'https://example.test/b.paged.md', kind: 'url', reason: 'url' }]);
    expect((await cli(['assemble', 'doc.paged.md', '--no-includes', '--resolve-includes'], d)).code).toBe(2);
    // never outside the text's folder: ../, an absolute path, a symlink that leaves it
    const sub = join(d, 'sub');
    mkdirSync(sub);
    symlinkSync(join(d, 'outside.paged.md'), join(sub, 'link.paged.md'));
    write(join(sub, 'esc.paged.md'), `# Esc\n\n{{md ../outside.paged.md}}\n\n{{md ${join(d, 'outside.paged.md')}}}\n\n{{md link.paged.md}}\n\n{{md missing.paged.md}}\n\n\`\`\`\n{{md ../outside.paged.md}}\n\`\`\`\n`);
    const esc = await cli(['assemble', 'esc.paged.md', '--resolve-includes', '--json'], sub);
    expect(esc.code, esc.stdout).toBe(0);
    expect(extract(text(join(sub, 'esc.paged.html')))!.includes).toBeUndefined();
    const escWarnings = json(esc).warnings as string[];
    const escWarn = escWarnings.join('\n');
    expect(escWarn.match(/outside the text's folder/g)).toHaveLength(3);
    expect(escWarn).toMatch(/\{\{md missing\.paged\.md\}\} is not resolved: no such file .*"Included file not available" note/);
    // one warning per directive (no second "is not resolved" line after --resolve-includes), and no hint to pass the flag given
    expect(escWarnings.filter((w) => /is not resolved/.test(w))).toHaveLength(4);
    expect(escWarn).not.toMatch(/pass --resolve-includes/);
    expect(json(esc).unresolved).toEqual([
      { target: '../outside.paged.md', kind: 'file', reason: 'outside-folder' },
      { target: join(d, 'outside.paged.md'), kind: 'file', reason: 'outside-folder' },
      { target: 'link.paged.md', kind: 'file', reason: 'outside-folder' },
      { target: 'missing.paged.md', kind: 'file', reason: 'no-such-file' },
    ]);
    expect(json(esc)).toMatchObject({ includes: 0, resolved: 0 });
    expect(text(join(sub, 'esc.paged.html'))).not.toContain('OUTSIDE');
    // without --resolve-includes the real reason is named too — never "pass --resolve-includes" for a file it cannot read (round 3, L5)
    const plain = await cli(['assemble', 'esc.paged.md', '--json'], sub);
    expect(plain.code, plain.stdout).toBe(0);
    expect(json(plain).unresolved).toEqual(json(esc).unresolved);
    const plainWarn = (json(plain).warnings as string[]).join('\n');
    expect(plainWarn).not.toMatch(/pass --resolve-includes/);
    expect(plainWarn.match(/outside the text's folder .*--resolve-includes does not read it either/g)).toHaveLength(3);
    noTemp(d);
  }, 240_000);

  it('[T.9] writes go through a temporary file and a rename (none left), keep the replaced file\'s mode, and replace a symbolic link\'s target, not the link', async () => {
    const d = folder();
    write(join(d, 'w.paged.md'), '# W\n');
    expect((await cli(['assemble', 'w.paged.md'], d)).code).toBe(0);
    // a hard link to the old file keeps the old bytes: the new file is a new inode (rename), not a rewrite in place
    linkSync(join(d, 'w.paged.html'), join(d, 'old-link.html'));
    const before = statSync(join(d, 'w.paged.html')).ino;
    write(join(d, 'w.paged.md'), '# W\n'); // same text: no refusal
    chmodSync(join(d, 'w.paged.html'), 0o640);
    expect((await cli(['assemble', 'w.paged.md', '--cdn'], d)).code).toBe(0);
    expect(statSync(join(d, 'w.paged.html')).ino).not.toBe(before);
    expect(text(join(d, 'old-link.html'))).toBe(assemble('# W\n'));
    expect(text(join(d, 'w.paged.html'))).toBe(assemble('# W\n', { delivery: 'cdn' }));
    expect(statSync(join(d, 'w.paged.html')).mode & 0o777).toBe(0o640);
    // a symbolic link stays a link; the file it points to gets the new bytes, with its mode
    mkdirSync(join(d, 'real'));
    write(join(d, 'real', 'target.paged.html'), assemble('# W\n'));
    chmodSync(join(d, 'real', 'target.paged.html'), 0o600);
    symlinkSync(join(d, 'real', 'target.paged.html'), join(d, 'linked.paged.html'));
    write(join(d, 'linked.paged.md'), '# W\n');
    expect((await cli(['assemble', 'linked.paged.md', '--cdn'], d)).code).toBe(0);
    expect(lstatSync(join(d, 'linked.paged.html')).isSymbolicLink()).toBe(true);
    expect(text(join(d, 'real', 'target.paged.html'))).toBe(assemble('# W\n', { delivery: 'cdn' }));
    expect(statSync(join(d, 'real', 'target.paged.html')).mode & 0o777).toBe(0o600);
    noTemp(d);
    noTemp(join(d, 'real'));
  }, 240_000);

  it('[T.10] neither upgrade nor assemble downgrades (a newer shell is refused unless --force, which warns and keeps <file>~); upgrade refuses a file cut off inside its text unless --force, keeps another document at -o, and never writes the text twin onto a file', async () => {
    const d = folder();
    const t = '# Up\n';
    const newer = assemble(t, { delivery: 'cdn' }).split(`"shell":"${VERSION}"`).join('"shell":"99.0.0"');
    write(join(d, 'newer.paged.html'), newer);
    const r = await cli(['upgrade', 'newer.paged.html', '--json'], d);
    expect(r.code).toBe(1);
    expect(String(json(r).error)).toMatch(/newer than this tool.*downgrade.*orz-paged@latest.*--force/);
    expect(text(join(d, 'newer.paged.html'))).toBe(newer);
    expect(existsSync(join(d, 'newer.paged.md'))).toBe(false);
    expect(() => upgrade(newer)).toThrow(/downgrade/);
    expect(upgrade(newer, { delivery: 'cdn', downgrade: true }).html).toBe(assemble(t, { delivery: 'cdn' }));
    const forced = await cli(['upgrade', 'newer.paged.html', '--force', '--json'], d);
    expect(forced.code, forced.stdout).toBe(0);
    expect(text(join(d, 'newer.paged.html'))).toBe(assemble(t, { delivery: 'cdn' }));
    expect((json(forced).warnings as string[]).join('\n')).toMatch(/newer shell .*99\.0\.0/);
    expect(text(join(d, 'newer.paged.html~'))).toBe(newer); // the newer file is kept
    expect(json(r)).toMatchObject({ reason: 'newer-shell' });
    // assemble over a file of a newer shell: refused (even for the same text), --force warns and keeps it (round 2, F3)
    write(join(d, 'up.paged.md'), t);
    write(join(d, 'up.paged.html'), newer);
    const a1 = await cli(['assemble', 'up.paged.md', '--cdn', '--json'], d);
    expect(a1.code).toBe(1);
    expect(json(a1)).toMatchObject({ ok: false, reason: 'newer-shell' });
    expect(String(json(a1).error)).toMatch(/newer orz-paged \(99\.0\.0\).*orz-paged@latest.*--force/);
    expect(text(join(d, 'up.paged.html'))).toBe(newer);
    const a2 = await cli(['assemble', 'up.paged.md', '--cdn', '--force', '--json'], d);
    expect(a2.code, a2.stdout).toBe(0);
    expect(text(join(d, 'up.paged.html'))).toBe(assemble(t, { delivery: 'cdn' }));
    expect(text(join(d, 'up.paged.html~'))).toBe(newer);
    expect((json(a2).warnings as string[]).join('\n')).toMatch(/had a newer shell \(orz-paged 99\.0\.0\); --force re-assembled it/);
    // a file cut off inside its #orz-src island: upgrade refuses (the text may be incomplete); --force keeps <file>~ (round 2, B#4)
    const whole = assemble('# Cut\n\nfirst part\n\nsecond part\n', { delivery: 'cdn' }).split(`"shell":"${VERSION}"`).join('"shell":"0.0.1"');
    const cutFile = whole.slice(0, whole.indexOf('second part') + 6);
    write(join(d, 'cut.paged.html'), cutFile);
    const c1 = await cli(['upgrade', 'cut.paged.html', '--no-text', '--json'], d);
    expect(c1.code).toBe(1);
    expect(json(c1)).toMatchObject({ ok: false, reason: 'unclosed-island', next: { command: 'extract', args: ['cut.paged.html', '-o', 'cut.recovered.paged.md'] } });
    expect(String(json(c1).error)).toMatch(/cut off.*may be incomplete/);
    expect(text(join(d, 'cut.paged.html'))).toBe(cutFile);
    const c2 = await cli(['upgrade', 'cut.paged.html', '--no-text', '--force', '--json'], d);
    expect(c2.code, c2.stdout).toBe(0);
    expect(text(join(d, 'cut.paged.html~'))).toBe(cutFile);
    expect((json(c2).warnings as string[]).join('\n')).toMatch(/cut off.*may be incomplete/);
    // -o onto another document: refused; --force keeps it as <file>~
    write(join(d, 'src.paged.html'), assemble('# Source\n', { delivery: 'cdn' }));
    write(join(d, 'other.paged.html'), assemble('# Another document\n', { delivery: 'cdn' }));
    const o = await cli(['upgrade', 'src.paged.html', '-o', 'other.paged.html', '--no-text'], d);
    expect(o.code).toBe(1);
    expect(o.stderr).toMatch(/other\.paged\.html exists and holds another text/);
    expect(extract(text(join(d, 'other.paged.html')))!.text).toBe('# Another document\n');
    expect((await cli(['upgrade', 'src.paged.html', '-o', 'other.paged.html', '--no-text', '--force'], d)).code).toBe(0);
    expect(extract(text(join(d, 'other.paged.html')))!.text).toBe('# Source\n');
    expect(extract(text(join(d, 'other.paged.html~')))!.text).toBe('# Another document\n');
    // the text twin may not land on the file (in place or -o)
    expect((await cli(['upgrade', 'src.paged.html', '--text', 'src.paged.html'], d)).code).toBe(2);
    expect((await cli(['upgrade', 'src.paged.html', '-o', 'x.paged.html', '--text', 'x.paged.html'], d)).code).toBe(2);
    expect(existsSync(join(d, 'x.paged.html'))).toBe(false);
    noTemp(d);
  }, 240_000);

  it('[T.12] compare-and-swap for agents without a cache or history: inspect, extract and assemble report the SHA-256 of the text a file holds (for a text twin: of its exact bytes, as sha256sum); assemble --replaces <sha256> replaces a different .paged.html only while its text has that hash, extract --replaces only an x.paged.md with that hash; any other text is refused (replaces-mismatch, nothing written); a malformed token is a usage error', async () => {
    const d = folder();
    let k = 0;
    const fresh = (): NodeJS.ProcessEnv => ({ XDG_CACHE_HOME: join(d, `.cache-${++k}`) }); // a fresh sandbox every run
    const fileHash = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
    const t = '\uFEFF# T\r\n\nbody\n';
    writeFileSync(join(d, 'x.paged.md'), t);
    const a = await cli(['assemble', 'x.paged.md', '--json'], d, fresh());
    expect(a.code, a.stdout).toBe(0);
    expect(json(a).sha256).toBe(sha256(storedText(t)));
    expect(sha256(t)).toBe(fileHash(join(d, 'x.paged.md')));
    const it1 = json(await cli(['inspect', 'x.paged.md', '--json'], d, fresh()));
    expect(it1.sha256).toBe(fileHash(join(d, 'x.paged.md')));
    expect((it1.twin as { sha256: string }).sha256).toBe(json(a).sha256);
    const it2 = json(await cli(['inspect', 'x.paged.html', '--json'], d, fresh()));
    expect(it2.sha256).toBe(json(a).sha256);
    expect((it2.twin as { sha256: string }).sha256).toBe(fileHash(join(d, 'x.paged.md')));
    expect((await cli(['inspect', 'x.paged.md'], d, fresh())).stdout).toMatch(new RegExp(`^sha256\\s+${it1.sha256 as string} `, 'm'));
    // a browser save; the agent (fresh sandbox) reads the token from inspect, merges, assembles with it
    write(join(d, 'x.paged.html'), assemble('# T\r\n\nbody\r\nbrowser\r\n'));
    const token = (json(await cli(['inspect', 'x.paged.md', '--json'], d, fresh())).twin as { sha256: string }).sha256;
    expect(token).toBe(sha256(storedText('# T\r\n\nbody\r\nbrowser\r\n')));
    const plain = await cli(['assemble', 'x.paged.md', '--json'], d, fresh());
    expect(json(plain)).toMatchObject({ ok: false, reason: 'twin-differs' });
    expect(String(json(plain).error)).toContain(`--replaces ${token}`); // the refusal names the token
    writeFileSync(join(d, 'x.paged.md'), '# T\r\n\nbody\r\nbrowser\r\nagent\r\n');
    const swapped = await cli(['assemble', 'x.paged.md', '--replaces', token.toUpperCase(), '--json'], d, fresh());
    expect(swapped.code, swapped.stdout).toBe(0);
    expect(json(swapped)).toMatchObject({ replaced: 'token', backup: null, sha256: sha256(storedText('# T\r\n\nbody\r\nbrowser\r\nagent\r\n')) });
    // another browser save meanwhile: the stale token is refused, nothing written
    const another = assemble('# T\r\n\r\nother browser work\r\n');
    write(join(d, 'x.paged.html'), another);
    writeFileSync(join(d, 'x.paged.md'), '# T\r\n\nbody\r\nbrowser\r\nagent\r\nmore\r\n');
    const stale = await cli(['assemble', 'x.paged.md', '--replaces', token, '--json'], d, fresh());
    expect(stale.code).toBe(1);
    expect(json(stale)).toMatchObject({ ok: false, reason: 'replaces-mismatch', next: { command: 'extract', args: ['x.paged.html', '-o', 'x.browser.paged.md'] } });
    expect(String(json(stale).error)).toContain(sha256('# T\r\n\r\nother browser work\r\n'));
    expect(text(join(d, 'x.paged.html'))).toBe(another);
    // extract --replaces: only the x.paged.md with that hash is replaced
    const mine = readFileSync(join(d, 'x.paged.md'));
    const wrong = await cli(['extract', 'x.paged.html', '--replaces', token, '--json'], d, fresh());
    expect(wrong.code).toBe(1);
    expect(json(wrong)).toMatchObject({ ok: false, reason: 'replaces-mismatch' });
    expect(readFileSync(join(d, 'x.paged.md')).equals(mine)).toBe(true);
    const right = await cli(['extract', 'x.paged.html', '--replaces', fileHash(join(d, 'x.paged.md')), '--json'], d, fresh());
    expect(right.code, right.stdout).toBe(0);
    expect(json(right)).toMatchObject({ replaced: 'token', backup: null, sha256: sha256('# T\r\n\r\nother browser work\r\n') });
    expect(text(join(d, 'x.paged.md'))).toBe('# T\r\n\r\nother browser work\r\n');
    // a malformed token
    const bad = await cli(['assemble', 'x.paged.md', '--replaces', 'abc', '--json'], d, fresh());
    expect(bad.code).toBe(2);
    expect(json(bad)).toMatchObject({ ok: false, reason: 'bad-usage' });
    noTemp(d);
  }, 240_000);

  it('[T.13] machine-readable refusals: every --json failure has a stable reason code (bad-usage, no-such-file, not-utf8, exists, not-orz, twin-differs, output-differs, replaces-mismatch, legacy-file, newer-shell, newer-format, unclosed-island, other-kind, assembled-input, …) and, where a command resolves it, next: { command, args }', async () => {
    const d = folder();
    const fail = async (args: string[], reason: string, next?: { command: string; args: string[] }): Promise<void> => {
      const r = await cli([...args, '--json'], d);
      expect(r.code, args.join(' ')).toBe(reason === 'bad-usage' ? 2 : 1);
      const j = json(r);
      expect(j, args.join(' ')).toMatchObject({ ok: false, reason });
      expect(typeof j.error).toBe('string');
      if (next) expect(j.next, args.join(' ')).toEqual(next); else expect(j).not.toHaveProperty('next');
    };
    write(join(d, 'doc.paged.md'), '# Doc\n');
    await fail(['assemble', 'doc.paged.md', '--frobnicate'], 'bad-usage');
    await fail(['assemble', 'nope.paged.md'], 'no-such-file');
    writeFileSync(join(d, 'bad.paged.md'), Buffer.from([0x23, 0xff, 0x0a]));
    await fail(['assemble', 'bad.paged.md'], 'not-utf8');
    await fail(['new', 'doc.paged.md'], 'exists');
    write(join(d, 'doc.paged.html'), '<!doctype html><p>a page</p>');
    await fail(['assemble', 'doc.paged.md'], 'not-orz');
    await fail(['extract', 'doc.paged.html'], 'not-orz', { command: 'inspect', args: ['doc.paged.html'] });
    rmSync(join(d, 'doc.paged.html'));
    write(join(d, 'other.paged.html'), assemble('# Another document\n'));
    await fail(['assemble', 'doc.paged.md', '-o', 'other.paged.html'], 'output-differs', { command: 'extract', args: ['other.paged.html', '-o', 'doc.browser.paged.md'] });
    expect((await cli(['assemble', 'doc.paged.md'], d)).code).toBe(0);
    await fail(['assemble', 'doc.paged.html'], 'assembled-input', { command: 'extract', args: ['doc.paged.html'] });
    write(join(d, 'deck.slides.md'), '# s\n');
    await fail(['assemble', 'deck.slides.md'], 'other-kind');
    write(join(d, 'newer.paged.md'), '{{nyml\nkind: document\nformat: 2\n}}\n\nx\n');
    await fail(['assemble', 'newer.paged.md'], 'newer-format');
    // a 0.x file: extract → upgrade; assembling a text over one → upgrade --text <x>.browser.paged.md (round 2, B#3)
    const legacy = read(LEGACY_FILES['sample']!);
    write(join(d, 'old.paged.html'), legacy);
    await fail(['extract', 'old.paged.html'], 'legacy-file', { command: 'upgrade', args: ['old.paged.html'] });
    write(join(d, 'old.paged.md'), '{{nyml\nkind: meta\ntitle: Old\n}}\n\n# my 0.x text, edited\n');
    await fail(['assemble', 'old.paged.md'], 'legacy-file', { command: 'upgrade', args: ['old.paged.html', '--text', 'old.browser.paged.md'] });
    const lr = json(await cli(['assemble', 'old.paged.md', '--json'], d));
    expect(String(lr.error)).toMatch(/legacy orz-paged 0\.x file.*orz-paged upgrade old\.paged\.html --text old\.browser\.paged\.md.*merge/);
    expect(String(lr.error)).not.toMatch(/orz-paged extract/);
    await fail(['upgrade', 'old.paged.html'], 'twin-differs', { command: 'upgrade', args: ['old.paged.html', '--text', 'old.browser.paged.md'] });
    expect(text(join(d, 'old.paged.html'))).toBe(legacy);
    // the advice works: upgrade --text old.browser.paged.md, then the merge
    expect((await cli(['upgrade', 'old.paged.html', '--text', 'old.browser.paged.md'], d)).code).toBe(0);
    expect(text(join(d, 'old.browser.paged.md'))).toMatch(/^\{\{nyml\nkind: document\n/);
    noTemp(d);
  }, 240_000);
  /** A git runner for a folder (null when git is not installed). */
  const gitIn = async (dir: string): Promise<((...args: string[]) => Promise<Run>) | null> => {
    const git = (...args: string[]): Promise<Run> => new Promise((res) => execFile('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: dir }, (e, stdout, stderr) => res({ code: e ? 1 : 0, stdout, stderr })));
    return (await git('init', '-q')).code === 0 ? git : null;
  };
  let emptyCaches = 0;
  /** A fresh, empty cache for one run: only the same text, git or a token can allow a replacement. */
  const noCache = (): NodeJS.ProcessEnv => ({ XDG_CACHE_HOME: join(tmp, `.r3-cache-${++emptyCaches}`) });

  it('[T.14] every output path is guarded like the twin: the publish loop to -o needs no --force; another text / another document at -o is output-differs; git relaxes only the twin; suggested commands carry the user\'s own arguments and free names; following next resolves it; -o creates folders', async () => {
    const d = folder();
    expect((await cli(['new', 'w.paged.md'], d)).code).toBe(0);
    // the exact round-3 repro: assemble to -o (into a folder that does not exist yet), edit, the same command again
    const publish = ['assemble', 'w.paged.md', '-o', 'public/w.paged.html', '--cdn'];
    const p1 = await cli([...publish, '--json'], d);
    expect(p1.code, p1.stdout).toBe(0);
    write(join(d, 'w.paged.md'), `${text(join(d, 'w.paged.md'))}\nedit\n`);
    const p2 = await cli([...publish, '--json'], d);
    expect(p2.code, p2.stdout).toBe(0);
    expect(json(p2)).toMatchObject({ replaced: 'cache', backup: null, delivery: 'cdn' });
    // a browser save in the published copy and an agent edit of w.paged.md: refused, every command from the real arguments
    const base = text(join(d, 'w.paged.md'));
    write(join(d, 'public', 'w.paged.html'), assemble(`${base}browser\n`, { delivery: 'cdn' }));
    write(join(d, 'w.paged.md'), `${base}agent\n`);
    const r = await cli([...publish, '--resolve-includes', '--json'], d);
    expect(r.code).toBe(1);
    expect(json(r)).toMatchObject({ ok: false, reason: 'output-differs', next: { command: 'extract', args: ['public/w.paged.html', '-o', 'w.browser.paged.md'] } });
    const err = String(json(r).error);
    expect(err).toMatch(/^public\/w\.paged\.html holds another text than w\.paged\.md/);
    const named = /`orz-paged (assemble [^`]+)`/.exec(err)![1]!.split(' ');
    expect(named).toEqual(['assemble', 'w.paged.md', '-o', 'public/w.paged.html', '--cdn', '--resolve-includes', '--replaces', sha256(`${base}browser\n`)]);
    // follow next verbatim, merge, then the named command
    const next = json(r).next as { command: string; args: string[] };
    expect((await cli([next.command, ...next.args], d)).code).toBe(0);
    expect(text(join(d, 'w.browser.paged.md'))).toBe(`${base}browser\n`);
    write(join(d, 'w.paged.md'), `${base}browser\nagent\n`);
    const done = await cli([...named, '--json'], d);
    expect(done.code, done.stdout).toBe(0);
    expect(json(done)).toMatchObject({ replaced: 'token', delivery: 'cdn' });
    expect(extract(text(join(d, 'public', 'w.paged.html')))!.text).toBe(`${base}browser\nagent\n`);
    // again: w.browser.paged.md exists now, so the next copy is w.browser-2.paged.md (never w.browser.browser.paged.md)
    write(join(d, 'public', 'w.paged.html'), assemble(`${base}browser\nagent\nbrowser 2\n`, { delivery: 'cdn' }));
    write(join(d, 'w.paged.md'), `${base}browser\nagent\nagent 2\n`);
    expect(json(await cli([...publish, '--json'], d))).toMatchObject({ reason: 'output-differs', next: { command: 'extract', args: ['public/w.paged.html', '-o', 'w.browser-2.paged.md'] } });
    // --no-includes is carried in the commands it names (C20)
    const noInc = String(json(await cli([...publish, '--no-includes', '--json'], d)).error);
    expect(/`orz-paged (assemble [^`]+)`/.exec(noInc)![1]!.split(' ')).toEqual(['assemble', 'w.paged.md', '-o', 'public/w.paged.html', '--cdn', '--no-includes', '--replaces', sha256(`${base}browser\nagent\nbrowser 2\n`)]);
    // extract -o onto an edited copy: the advice keeps -o and names a free copy
    write(join(d, 'w.browser.paged.md'), 'merged by hand\n');
    const e = await cli(['extract', 'public/w.paged.html', '-o', 'w.browser.paged.md', '--json'], d);
    expect(json(e)).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'extract', args: ['public/w.paged.html', '-o', 'w.browser-2.paged.md'] } });
    expect(String(json(e).error)).toContain(`\`orz-paged extract public/w.paged.html -o w.browser.paged.md --replaces ${sha256('merged by hand\n')}\``);
    expect(String(json(e).error)).not.toMatch(/browser\.browser/);
    // another document (another uid) at -o: output-differs, "another document", no next
    expect((await cli(['new', 'other.paged.md'], d)).code).toBe(0);
    const doc = await cli(['assemble', 'other.paged.md', '-o', 'public/w.paged.html', '--json'], d);
    expect(json(doc)).toMatchObject({ ok: false, reason: 'output-differs' });
    expect(json(doc)).not.toHaveProperty('next');
    expect(String(json(doc).error)).toMatch(/holds another document \(uid doc-/);
    // the record is keyed by the pair: b.paged.md may not replace what a.paged.md last wrote to a shared -o path (C06)
    write(join(d, 'a.paged.md'), '# A\n');
    write(join(d, 'b.paged.md'), '# B\n');
    expect((await cli(['assemble', 'a.paged.md', '-o', 'shared.paged.html'], d)).code).toBe(0);
    expect(json(await cli(['assemble', 'b.paged.md', '-o', 'shared.paged.html', '--json'], d))).toMatchObject({ ok: false, reason: 'output-differs' });
    expect(extract(text(join(d, 'shared.paged.html')))!.text).toBe('# A\n');
    // one record per pair, not per output: a.paged.md and b.paged.md (the same text) both write shared.paged.html; a.paged.md's record survives b.paged.md's run
    write(join(d, 'b.paged.md'), '# A\n');
    expect((await cli(['assemble', 'b.paged.md', '-o', 'shared.paged.html'], d)).code).toBe(0);
    write(join(d, 'a.paged.md'), '# A\n\nedited\n');
    expect(json(await cli(['assemble', 'a.paged.md', '-o', 'shared.paged.html', '--json'], d))).toMatchObject({ ok: true, replaced: 'cache' });
    write(join(d, 'a.paged.md'), '# A\n');
    expect((await cli(['assemble', 'a.paged.md', '-o', 'shared.paged.html'], d)).code).toBe(0);
    // extract -o and upgrade -o create their folders too (L4)
    expect((await cli(['extract', 'shared.paged.html', '-o', 'deep/er/a.paged.md'], d)).code).toBe(0);
    expect(text(join(d, 'deep', 'er', 'a.paged.md'))).toBe('# A\n');
    expect((await cli(['upgrade', 'shared.paged.html', '-o', 'up/shared.paged.html', '--text', 'up/text/shared.paged.md'], d)).code).toBe(0);
    expect(text(join(d, 'up', 'text', 'shared.paged.md'))).toBe('# A\n');
    // git relaxes only the twin (C21): a committed text of c.paged.md at an -o path (no record) is refused; at the twin it is replaced
    const g = folder();
    const git = await gitIn(g);
    if (git) {
      write(join(g, 'c.paged.md'), '# C1\n');
      expect((await git('add', 'c.paged.md')).code).toBe(0);
      expect((await git('commit', '-q', '-m', 'c')).code).toBe(0);
      mkdirSync(join(g, 'pub'));
      write(join(g, 'pub', 'c.paged.html'), assemble('# C1\n'));
      write(join(g, 'c.paged.html'), assemble('# C1\n'));
      write(join(g, 'c.paged.md'), '# C1\n\nedited\n');
      expect(json(await cli(['assemble', 'c.paged.md', '-o', 'pub/c.paged.html', '--json'], g, noCache()))).toMatchObject({ ok: false, reason: 'output-differs' });
      expect(json(await cli(['assemble', 'c.paged.md', '--json'], g, noCache()))).toMatchObject({ ok: true, replaced: 'git-head' });
    }
    noTemp(d);
    noTemp(join(d, 'public'));
    // M11, M13: git is the twin's history only — an -o output is never vouched for by the input's commits, even when
    // both texts carry the same uid (no record: a fresh cache)
    const go = folder();
    const gitO = await gitIn(go);
    if (gitO) {
      const X = '{{nyml\nkind: document\ncarrier: paged\nuid: doc-t14gitout0001\n}}\n\n# X\n';
      write(join(go, 'x.paged.md'), X);
      expect((await gitO('add', 'x.paged.md')).code).toBe(0);
      expect((await gitO('commit', '-q', '-m', 'x')).code).toBe(0);
      write(join(go, 'site.paged.html'), assemble(`${X}\nsaved in the browser\n`));
      // assemble x.paged.md -o site.paged.html: x.paged.md is committed, but that says nothing about site.paged.html — no "bring it into x.paged.md"
      expect(json(await cli(['assemble', 'x.paged.md', '-o', 'site.paged.html', '--json'], go, noCache()))).toMatchObject({ ok: false, reason: 'output-differs', next: { command: 'extract', args: ['site.paged.html', '-o', 'x.browser.paged.md'] } });
      // extract site.paged.html -o x.paged.md: x.paged.md = HEAD, but git vouches only for x.paged.html's twin — refused, x.paged.md kept
      expect(json(await cli(['extract', 'site.paged.html', '-o', 'x.paged.md', '--json'], go, noCache()))).toMatchObject({ ok: false, reason: 'twin-differs' });
      expect(text(join(go, 'x.paged.md'))).toBe(X);
    }
  }, 240_000);

  it('[T.15] assemble keeps the existing file\'s delivery unless --cdn or --inline is given', async () => {
    const d = folder();
    write(join(d, 'a.paged.md'), '# A\n');
    expect(json(await cli(['assemble', 'a.paged.md', '--cdn', '--json'], d))).toMatchObject({ delivery: 'cdn' });
    write(join(d, 'a.paged.md'), '# A\n\nmore\n');
    const kept = await cli(['assemble', 'a.paged.md', '--json'], d);
    expect(json(kept)).toMatchObject({ ok: true, delivery: 'cdn' });
    expect(text(join(d, 'a.paged.html'))).toBe(assemble('# A\n\nmore\n', { delivery: 'cdn' }));
    expect((await cli(['assemble', 'a.paged.md'], d)).stdout).toMatch(/\(cdn as before, orz-paged /);
    expect(json(await cli(['assemble', 'a.paged.md', '--inline', '--json'], d))).toMatchObject({ delivery: 'inline' });
    expect(json(await cli(['assemble', 'a.paged.md', '--json'], d))).toMatchObject({ delivery: 'inline' });
    expect(text(join(d, 'a.paged.html'))).toBe(assemble('# A\n\nmore\n'));
    expect(json(await cli(['assemble', 'a.paged.md', '--cdn', '--json'], d))).toMatchObject({ delivery: 'cdn' });
    write(join(d, 'new.paged.md'), '# N\n');
    expect(json(await cli(['assemble', 'new.paged.md', '--json'], d))).toMatchObject({ delivery: 'inline' });
  }, 240_000);

  it('[T.16] backups are never destroyed: <file>~, then <file>~1, ~2…; a symbolic link at a backup name is never followed', async () => {
    const d = folder();
    write(join(d, 'a.paged.md'), '# A\n');
    const page = (s: string): string => `<!doctype html><p>${s}</p>`;
    write(join(d, 'a.paged.html'), page('one'));
    expect(json(await cli(['assemble', 'a.paged.md', '--force', '--json'], d))).toMatchObject({ backup: join(d, 'a.paged.html~') });
    write(join(d, 'a.paged.html'), page('two'));
    const second = await cli(['assemble', 'a.paged.md', '--force', '--json'], d);
    expect(json(second)).toMatchObject({ backup: join(d, 'a.paged.html~1') });
    expect((json(second).warnings as string[]).join('\n')).toMatch(/kept as .*a\.paged\.html~1/);
    expect(text(join(d, 'a.paged.html~'))).toBe(page('one'));
    expect(text(join(d, 'a.paged.html~1'))).toBe(page('two'));
    // the same bytes as an existing backup: that one is reused, no new name
    write(join(d, 'a.paged.html'), page('one'));
    expect(json(await cli(['assemble', 'a.paged.md', '--force', '--json'], d))).toMatchObject({ backup: join(d, 'a.paged.html~') });
    expect(existsSync(join(d, 'a.paged.html~2'))).toBe(false);
    // a symbolic link at <file>~ (to a file, and dangling): not followed, not replaced; the next free name is used
    write(join(d, 'victim.txt'), 'VICTIM\n');
    const s = folder();
    write(join(s, 'x.paged.md'), '# X\n');
    symlinkSync(join(d, 'victim.txt'), join(s, 'x.paged.html~'));
    symlinkSync(join(d, 'ghost.txt'), join(s, 'x.paged.html~1'));
    write(join(s, 'x.paged.html'), page('three'));
    expect(json(await cli(['assemble', 'x.paged.md', '--force', '--json'], s))).toMatchObject({ backup: join(s, 'x.paged.html~2') });
    expect(text(join(d, 'victim.txt'))).toBe('VICTIM\n');
    expect(existsSync(join(d, 'ghost.txt'))).toBe(false);
    expect(lstatSync(join(s, 'x.paged.html~')).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(s, 'x.paged.html~1')).isSymbolicLink()).toBe(true);
    expect(text(join(s, 'x.paged.html~2'))).toBe(page('three'));
    // a symbolic link at <file>~ whose target holds exactly the bytes replaced is not a backup either (lstat; C09)
    const c = folder();
    write(join(c, 'y.paged.md'), '# Y\n');
    write(join(c, 'y.paged.html'), page('four'));
    write(join(d, 'same.txt'), page('four'));
    symlinkSync(join(d, 'same.txt'), join(c, 'y.paged.html~'));
    expect(json(await cli(['assemble', 'y.paged.md', '--force', '--json'], c))).toMatchObject({ backup: join(c, 'y.paged.html~1') });
    expect(lstatSync(join(c, 'y.paged.html~')).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(c, 'y.paged.html~1')).isFile()).toBe(true);
    expect(text(join(c, 'y.paged.html~1'))).toBe(page('four'));
    // extract --force and new --force too
    write(join(s, 'x.paged.md'), '# X edited\n');
    write(join(s, 'x.paged.md~'), 'an older backup\n');
    expect(json(await cli(['extract', 'x.paged.html', '--force', '--json'], s))).toMatchObject({ backup: join(s, 'x.paged.md~1') });
    expect(text(join(s, 'x.paged.md~'))).toBe('an older backup\n');
    expect(text(join(s, 'x.paged.md~1'))).toBe('# X edited\n');
    write(join(s, 'n.paged.md'), 'mine\n');
    write(join(s, 'n.paged.md~'), 'older\n');
    expect(json(await cli(['new', 'n.paged.md', '--force', '--json'], s))).toMatchObject({ backups: [join(s, 'n.paged.md~1')] });
    expect(text(join(s, 'n.paged.md~'))).toBe('older\n');
    noTemp(s);
  }, 240_000);

  it('[T.17] without a record: an unwritable cache warns and names the --replaces token (which works); the human output prints sha256; no file-time hint when both files are clean in git; the docs say full vs shallow clone and the revert rule', async () => {
    const d = folder();
    write(join(d, 'not-a-folder'), 'x');
    const ro = { XDG_CACHE_HOME: join(d, 'not-a-folder') };
    write(join(d, 'doc.paged.md'), '# Doc\n');
    const a = await cli(['assemble', 'doc.paged.md', '--json'], d, ro);
    expect(a.code, a.stdout).toBe(0);
    const h = json(a).sha256 as string;
    expect(json(a).warnings).toEqual([`pair not recorded (cache not writable: ${join(d, 'not-a-folder', 'orz-paged')}); the next assemble needs --replaces ${h}`]);
    write(join(d, 'doc.paged.md'), '# Doc\n\nedited\n');
    expect(json(await cli(['assemble', 'doc.paged.md', '--json'], d, ro))).toMatchObject({ ok: false, reason: 'twin-differs' });
    expect(json(await cli(['assemble', 'doc.paged.md', '--replaces', h, '--json'], d, ro))).toMatchObject({ ok: true, replaced: 'token' });
    const x = await cli(['extract', 'doc.paged.html', '-o', 'copy.paged.md', '--json'], d, ro);
    expect((json(x).warnings as string[]).join('\n')).toMatch(new RegExp(`pair not recorded .*the next extract needs --replaces ${json(x).sha256 as string}`));
    // the human output prints the sha256 (extract, upgrade; assemble: T.1)
    expect((await cli(['extract', 'doc.paged.html', '-o', 'copy2.paged.md'], d)).stdout).toMatch(new RegExp(`^  sha256 ${sha256('# Doc\n\nedited\n')} `, 'm'));
    expect((await cli(['upgrade', 'doc.paged.html', '--no-text'], d)).stdout).toMatch(new RegExp(`^  sha256 ${sha256('# Doc\n\nedited\n')} `, 'm'));
    // upgrade's sha256 is of the text the file holds (as stored), not of the text twin it writes: mixed line endings (C19)
    const u = folder();
    write(join(u, 'old.paged.html'), withLegacySource(read(LEGACY_FILES['sample']!), 'a\r\nb\nc\n'));
    const up = await cli(['upgrade', 'old.paged.html', '--json'], u);
    expect(up.code, up.stdout).toBe(0);
    const heldText = extract(text(join(u, 'old.paged.html')))!.text;
    expect(text(join(u, 'old.paged.md'))).not.toBe(heldText); // the twin keeps the mixed endings; the file holds them as stored
    expect(json(up).sha256).toBe(sha256(heldText));
    expect(json(up).sha256).not.toBe(sha256(text(join(u, 'old.paged.md'))));
    write(join(u, 'old2.paged.html'), withLegacySource(read(LEGACY_FILES['sample']!), 'a\r\nb\nc\n'));
    expect((await cli(['upgrade', 'old2.paged.html', '--no-text'], u)).stdout).toMatch(new RegExp(`^  sha256 ${sha256(extract(text(join(u, 'old2.paged.html')))!.text)} `, 'm'));
    // and it is the token: with no record, assemble replaces that file only with it
    write(join(u, 'old.paged.md'), `${text(join(u, 'old.paged.md'))}edited\n`);
    expect(json(await cli(['assemble', 'old.paged.md', '--replaces', json(up).sha256 as string, '--json'], u, noCache()))).toMatchObject({ ok: true, replaced: 'token' });
    // a fresh checkout: both files clean in git, their times a checkout's — no "changed after it" (M3)
    const g = folder();
    const git = await gitIn(g);
    if (git) {
      write(join(g, '.gitattributes'), '*.md text eol=crlf\n'); // the working copy of x.paged.md differs from its blob: not a known state
      write(join(g, 'x.paged.md'), '# X\r\n\r\ntext\r\n');
      write(join(g, 'x.paged.html'), assemble('# X\n\nsaved in the browser\n'));
      expect((await git('add', '.')).code).toBe(0);
      expect((await git('commit', '-q', '-m', 'both')).code).toBe(0);
      expect((await git('status', '--porcelain')).stdout).toBe('');
      touch(join(g, 'x.paged.md'), 1_700_000_000);
      touch(join(g, 'x.paged.html'), 1_700_000_100);
      const clean = await cli(['assemble', 'x.paged.md', '--json'], g, noCache());
      expect(json(clean)).toMatchObject({ ok: false, reason: 'twin-differs' });
      expect(String(json(clean).error)).not.toMatch(/changed after/);
      write(join(g, 'x.paged.html'), assemble('# X\n\nsaved in the browser again\n')); // now modified: the hint is back
      touch(join(g, 'x.paged.html'), 1_700_000_200);
      expect(String(json(await cli(['assemble', 'x.paged.md', '--json'], g, noCache())).error)).toMatch(/and was changed after it/);
    }
    // the docs: full vs shallow clone, the git-log revert rule, the robust idiom (F4, M3)
    const help = (await cli(['assemble', '--help'], d)).stdout + (await cli(['extract', '--help'], d)).stdout;
    for (const doc of [help.replace(/\s+/g, ' '), read('README.md').replace(/\s+/g, ' '), read('orz-paged-skills/SKILL.md').replace(/\s+/g, ' ')]) {
      expect(doc).toMatch(/full clone/);
      expect(doc).toMatch(/shallow (checkout|clone)/);
      expect(doc).toMatch(/--depth 1/);
      expect(doc).toMatch(/commit the revert first/);
    }
    expect(read('orz-paged-skills/SKILL.md').replace(/\s+/g, ' ')).toMatch(/pass the `sha256` the last command printed as `--replaces`/);
    // M08: a corrupt last-writer record (files/) is "unknown", never "no writer": git does not then vouch for x.paged.md
    const cw = folder();
    const gitW = await gitIn(cw);
    if (gitW) {
      const X = '{{nyml\nkind: document\ncarrier: paged\nuid: doc-t17corrupt001\n}}\n\n# X\n';
      write(join(cw, 'x.paged.md'), X);
      expect((await gitW('add', 'x.paged.md')).code).toBe(0);
      expect((await gitW('commit', '-q', '-m', 'x')).code).toBe(0);
      write(join(cw, 'x.paged.html'), assemble(`${X}\nsaved in the browser\n`));
      for (const corrupt of ['{"file":', '[]', '{"file":"elsewhere","twin":"x"}', '']) {
        const env = noCache();
        mkdirSync(join(env.XDG_CACHE_HOME!, 'orz-paged', 'files'), { recursive: true });
        write(join(env.XDG_CACHE_HOME!, 'orz-paged', 'files', `${sha256(join(cw, 'x.paged.html'))}.json`), corrupt);
        expect(json(await cli(['extract', 'x.paged.html', '--json'], cw, env)), JSON.stringify(corrupt)).toMatchObject({ ok: false, reason: 'twin-differs' });
        expect(text(join(cw, 'x.paged.md'))).toBe(X);
        expect(json(await cli(['assemble', 'x.paged.md', '--json'], cw, env))).toMatchObject({ ok: false, next: { command: 'extract', args: ['x.paged.html', '-o', 'x.browser.paged.md'] } });
      }
      // with no record at all, git vouches for the committed x.paged.md (the same document): replaced
      expect(json(await cli(['extract', 'x.paged.html', '--json'], cw, noCache()))).toMatchObject({ ok: true, replaced: 'git-head' });
    }
    // G2: a cache this CLI cannot write is read as no cache (its records may be stale): nothing is relaxed by it
    if (process.getuid?.() !== 0) {
      const r = folder();
      const env = { XDG_CACHE_HOME: join(r, 'cache') };
      const R = '{{nyml\nkind: document\ncarrier: paged\nuid: doc-t17readonly01\n}}\n\n# R\n';
      write(join(r, 'r.paged.md'), R);
      expect((await cli(['assemble', 'r.paged.md'], r, env)).code).toBe(0);
      write(join(r, 'r.paged.html'), assemble(`${R}\nsaved in the browser\n`));
      const dirs = [join(r, 'cache'), join(r, 'cache', 'orz-paged'), join(r, 'cache', 'orz-paged', 'pairs'), join(r, 'cache', 'orz-paged', 'files')];
      try {
        for (const dir of dirs) chmodSync(dir, 0o555);
        expect(json(await cli(['assemble', 'r.paged.md', '--json'], r, env))).toMatchObject({ ok: false, next: { command: 'extract', args: ['r.paged.html', '-o', 'r.browser.paged.md'] } });
        expect(json(await cli(['extract', 'r.paged.html', '--json'], r, env))).toMatchObject({ ok: false, reason: 'twin-differs' });
        expect(text(join(r, 'r.paged.md'))).toBe(R);
      } finally {
        for (const dir of dirs) chmodSync(dir, 0o755);
      }
      // writable again: the record counts (the same document, r.paged.md unchanged) — plain extract
      expect(json(await cli(['assemble', 'r.paged.md', '--json'], r, env))).toMatchObject({ ok: false, next: { command: 'extract', args: ['r.paged.html'] } });
    }
  }, 240_000);

  it('[T.18] advice shortcuts: only the file changed → plain extract; legacy → upgrade --text, merge, assemble --replaces with the sha256 upgrade printed (never --force); extract of a 0.x file next to x.paged.md → upgrade --text', async () => {
    const d = folder();
    expect((await cli(['new', 'x.paged.md', '--html'], d)).code).toBe(0);
    const base = text(join(d, 'x.paged.md'));
    write(join(d, 'x.paged.html'), assemble(`${base}browser\n`));
    const r = await cli(['assemble', 'x.paged.md', '--json'], d);
    expect(json(r)).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'extract', args: ['x.paged.html'] } });
    const n = json(r).next as { command: string; args: string[] };
    expect(json(await cli([n.command, ...n.args, '--json'], d))).toMatchObject({ ok: true, replaced: 'cache' });
    expect(text(join(d, 'x.paged.md'))).toBe(`${base}browser\n`);
    // -o: extract <out> -o <input>
    expect((await cli(['assemble', 'x.paged.md', '-o', 'pub/x.paged.html'], d)).code).toBe(0);
    write(join(d, 'pub', 'x.paged.html'), assemble(`${base}browser\npub\n`));
    expect(json(await cli(['assemble', 'x.paged.md', '-o', 'pub/x.paged.html', '--json'], d))).toMatchObject({ reason: 'output-differs', next: { command: 'extract', args: ['pub/x.paged.html', '-o', 'x.paged.md'] } });
    expect(json(await cli(['extract', 'pub/x.paged.html', '-o', 'x.paged.md', '--json'], d))).toMatchObject({ ok: true, replaced: 'cache' });
    // a 0.x file next to an edited text: the way out ends with --replaces, and it works
    const l = folder();
    const legacy = read(LEGACY_FILES['sample']!);
    write(join(l, 'old.paged.html'), legacy);
    expect(json(await cli(['extract', 'old.paged.html', '--json'], l))).toMatchObject({ reason: 'legacy-file', next: { command: 'upgrade', args: ['old.paged.html'] } });
    write(join(l, 'old.paged.md'), '{{nyml\nkind: meta\ntitle: Old\n}}\n\n# my 0.x text, edited\n');
    expect(json(await cli(['extract', 'old.paged.html', '--json'], l))).toMatchObject({ reason: 'legacy-file', next: { command: 'upgrade', args: ['old.paged.html', '--text', 'old.browser.paged.md'] } });
    const refused = await cli(['assemble', 'old.paged.md', '--json'], l);
    expect(json(refused)).toMatchObject({ reason: 'legacy-file', next: { command: 'upgrade', args: ['old.paged.html', '--text', 'old.browser.paged.md'] } });
    expect(String(json(refused).error)).toMatch(/then `orz-paged assemble old\.paged\.md --replaces` followed by that sha256/);
    expect(String(json(refused).error)).not.toMatch(/--force/);
    // a --replaces mismatch over a 0.x file: next is the upgrade too (C20)
    expect(json(await cli(['assemble', 'old.paged.md', '--replaces', '0'.repeat(64), '--json'], l))).toMatchObject({ reason: 'replaces-mismatch', next: { command: 'upgrade', args: ['old.paged.html', '--text', 'old.browser.paged.md'] } });
    const up = await cli(['upgrade', 'old.paged.html', '--text', 'old.browser.paged.md', '--json'], l);
    expect(up.code, up.stdout).toBe(0);
    write(join(l, 'old.paged.md'), `${text(join(l, 'old.browser.paged.md'))}\nmerged\n`);
    const fin = await cli(['assemble', 'old.paged.md', '--replaces', json(up).sha256 as string, '--json'], l, noCache());
    expect(fin.code, fin.stdout).toBe(0);
    expect(json(fin)).toMatchObject({ replaced: 'token' });
  }, 240_000);

  it('[T.19] an empty .paged.html is reported as empty (damaged); a line-ending change in x.paged.md is a change extract does not replace silently', async () => {
    const d = folder();
    write(join(d, 'e.paged.html'), '');
    const ex = await cli(['extract', 'e.paged.html', '--json'], d);
    expect(json(ex)).toMatchObject({ ok: false, reason: 'not-orz' });
    expect(String(json(ex).error)).toMatch(/e\.paged\.html is empty \(0 bytes\): a damaged or unfinished file/);
    expect(existsSync(join(d, 'e.paged.md'))).toBe(false);
    write(join(d, 'e.paged.md'), '# E\n');
    const as = await cli(['assemble', 'e.paged.md', '--json'], d);
    expect(json(as)).toMatchObject({ ok: false, reason: 'not-orz' });
    expect(String(json(as).error)).toMatch(/e\.paged\.html exists and is empty \(0 bytes\)/);
    expect(json(await cli(['inspect', 'e.paged.html', '--json'], d))).toMatchObject({ input: 'html' });
    // F6: x.paged.md with mixed line endings, assembled; the browser saves; x.paged.md only changes its line endings → refused
    const m = folder();
    const MH = '{{nyml\r\nkind: document\r\ncarrier: paged\r\nuid: doc-t19mixed00001\r\n}}\r\n\r\n'; // the same document on both sides (G1)
    writeFileSync(join(m, 'm.paged.md'), `${MH}a\r\nb\nc\n`);
    expect((await cli(['assemble', 'm.paged.md'], m)).code).toBe(0);
    write(join(m, 'm.paged.html'), assemble(`${MH}a\r\nb\r\nc\r\nbrowser\r\n`));
    writeFileSync(join(m, 'm.paged.md'), `${MH}a\r\nb\r\nc\r\n`);
    const eol = await cli(['extract', 'm.paged.html', '--json'], m);
    expect(json(eol)).toMatchObject({ ok: false, reason: 'twin-differs' });
    expect(text(join(m, 'm.paged.md'))).toBe(`${MH}a\r\nb\r\nc\r\n`);
    // the exact text it last synced is replaced (C07)
    writeFileSync(join(m, 'm.paged.md'), `${MH}a\r\nb\nc\n`);
    expect(json(await cli(['extract', 'm.paged.html', '--json'], m))).toMatchObject({ ok: true, replaced: 'cache' });
    expect(text(join(m, 'm.paged.md'))).toBe(`${MH}a\r\nb\r\nc\r\nbrowser\r\n`);
  }, 240_000);

  it('[T.20] the comparisons are exact: an anchored, full-length token for the right file; no fallback after a token mismatch; exact git and white-space comparisons; records keyed by real paths', async () => {
    const d = folder();
    write(join(d, 'x.paged.md'), '# X\n');
    expect((await cli(['assemble', 'x.paged.md'], d)).code).toBe(0);
    write(join(d, 'x.paged.html'), assemble('# X\n\nbrowser\n'));
    write(join(d, 'x.paged.md'), '# X\n\nagent\n');
    const held = sha256('# X\n\nbrowser\n');
    // C02: anchored — padding or extra characters are a usage error
    for (const bad of [` ${held}`, `${held}0`, `x${held}`, `${held}\n`]) {
      expect(json(await cli(['assemble', 'x.paged.md', '--replaces', bad, '--json'], d)), JSON.stringify(bad)).toMatchObject({ ok: false, reason: 'bad-usage' });
    }
    // C03: compared in full — the same first 16 digits are not enough
    const near = held.slice(0, 16) + (held[16] === '0' ? '1' : '0') + held.slice(17);
    expect(json(await cli(['assemble', 'x.paged.md', '--replaces', near, '--json'], d))).toMatchObject({ ok: false, reason: 'replaces-mismatch' });
    expect(extract(text(join(d, 'x.paged.html')))!.text).toBe('# X\n\nbrowser\n');
    // C05: extract --replaces takes the hash of x.paged.md, never of the file's own text
    expect(json(await cli(['extract', 'x.paged.html', '--replaces', held, '--json'], d))).toMatchObject({ ok: false, reason: 'replaces-mismatch' });
    expect(text(join(d, 'x.paged.md'))).toBe('# X\n\nagent\n');
    // C32: a mismatching token never falls back to the record (x.paged.md is the CLI's own state here)
    const y = folder();
    write(join(y, 'y.paged.md'), '# Y\n');
    expect((await cli(['assemble', 'y.paged.md'], y)).code).toBe(0);
    write(join(y, 'y.paged.html'), assemble('# Y\n\nbrowser\n'));
    expect(json(await cli(['extract', 'y.paged.html', '--replaces', '0'.repeat(64), '--json'], y))).toMatchObject({ ok: false, reason: 'replaces-mismatch' });
    expect(text(join(y, 'y.paged.md'))).toBe('# Y\n');
    // C28: trailing white space is a difference (no cache, no git)
    const w = folder();
    write(join(w, 'w.paged.html'), assemble('# W\n'));
    write(join(w, 'w.paged.md'), '# W\n\n');
    expect(json(await cli(['extract', 'w.paged.html', '--json'], w, noCache()))).toMatchObject({ ok: false, reason: 'twin-differs' });
    // C24: the record is keyed by real paths — a symbolic-link folder and its target are one pair
    const s = folder();
    mkdirSync(join(s, 'real'));
    symlinkSync(join(s, 'real'), join(s, 'link'));
    write(join(s, 'real', 'doc.paged.md'), '# Doc\n');
    expect((await cli(['assemble', 'link/doc.paged.md'], s)).code).toBe(0);
    write(join(s, 'real', 'doc.paged.md'), '# Doc\n\nedited\n');
    expect(json(await cli(['assemble', 'real/doc.paged.md', '--json'], s))).toMatchObject({ ok: true, replaced: 'cache' });
    // C11, C12: git states compare exactly
    const g = folder();
    const git = await gitIn(g);
    if (git) {
      const GH = '{{nyml\nkind: document\ncarrier: paged\nuid: doc-t20git000001\n}}\n\n'; // the same document on both sides (G1)
      writeFileSync(join(g, 'g.paged.md'), `${GH}a\r\nb\nc\n`);
      expect((await git('add', 'g.paged.md')).code).toBe(0);
      expect((await git('commit', '-q', '-m', 'g')).code).toBe(0);
      write(join(g, 'g.paged.html'), assemble(`${GH}a\nbrowser\n`));
      // M28: only the line endings changed, or only trailing white space was added — not the committed text: refused, kept
      for (const edit of [`${GH}a\r\nb\r\nc\r\n`, `${GH}a\r\nb\nc\r\n`, `${GH}a\r\nb\nc\n  \n`, `${GH}a\r\nb\nc\n\n`]) {
        writeFileSync(join(g, 'g.paged.md'), edit);
        expect(json(await cli(['extract', 'g.paged.html', '--json'], g, noCache())), JSON.stringify(edit)).toMatchObject({ ok: false, reason: 'twin-differs' });
        expect(text(join(g, 'g.paged.md'))).toBe(edit);
      }
      writeFileSync(join(g, 'g.paged.md'), `${GH}a\r\nb\nc\n`); // exactly HEAD
      expect(json(await cli(['extract', 'g.paged.html', '--json'], g, noCache()))).toMatchObject({ ok: true, replaced: 'git-head' });
      write(join(g, 'h.paged.md'), '# H\n');
      expect((await git('add', 'h.paged.md')).code).toBe(0);
      expect((await git('commit', '-q', '-m', 'h')).code).toBe(0);
      write(join(g, 'h.paged.html'), assemble('# H\n\n  \n')); // HEAD's text plus white space (a browser save)
      write(join(g, 'h.paged.md'), '# H\n\nedited\n');
      expect(json(await cli(['assemble', 'h.paged.md', '--json'], g, noCache()))).toMatchObject({ ok: false, reason: 'twin-differs' });
      // M23: h.paged.md is HEAD exactly and the file differs only by trailing white space — not "the same text": refused, kept
      write(join(g, 'h.paged.md'), '# H\n');
      expect(json(await cli(['assemble', 'h.paged.md', '--json'], g, noCache()))).toMatchObject({ ok: false, reason: 'twin-differs' });
      expect(extract(text(join(g, 'h.paged.html')))!.text).toBe('# H\n\n  \n');
    }
    // M26: the same text but CR LF in x.paged.md: a difference extract does not replace (no cache, no git)
    const c = folder();
    write(join(c, 'c.paged.html'), assemble('# C\n\nbody\n'));
    write(join(c, 'c.paged.md'), '# C\r\n\r\nbody\r\n');
    expect(json(await cli(['extract', 'c.paged.html', '--json'], c, noCache()))).toMatchObject({ ok: false, reason: 'twin-differs' });
    expect(text(join(c, 'c.paged.md'))).toBe('# C\r\n\r\nbody\r\n');
    // and the file trimmed of x.paged.md's trailing white space is not "the same text" for assemble (M23, no cache, no git)
    write(join(c, 'd.paged.html'), assemble('# D\n'));
    write(join(c, 'd.paged.md'), '# D\n\n\n');
    expect(json(await cli(['assemble', 'd.paged.md', '--json'], c, noCache()))).toMatchObject({ ok: false, reason: 'twin-differs' });
    expect(extract(text(join(c, 'd.paged.html')))!.text).toBe('# D\n');
    // M21: the uid upgrade mints for a 0.x file without one says nothing about identity — an existing old.paged.md with a
    // uid is a different text to merge (twin-differs, with the upgrade --text next), not "another document"
    const mu = folder();
    write(join(mu, 'old.paged.html'), read(LEGACY_FILES['sample']!));
    const own = '{{nyml\nkind: document\ncarrier: paged\nuid: doc-t20minted0001\n}}\n\n# my text\n';
    write(join(mu, 'old.paged.md'), own);
    expect(json(await cli(['upgrade', 'old.paged.html', '--json'], mu, noCache()))).toMatchObject({ ok: false, reason: 'twin-differs', next: { command: 'upgrade', args: ['old.paged.html', '--text', 'old.browser.paged.md'] } });
    expect(text(join(mu, 'old.paged.md'))).toBe(own);
  }, 240_000);

  it('[T.22] the 0.x forms (--template, --new, --list-templates) are refused with the 1.0 command that does the same as next; following it writes what 0.x wrote', async () => {
    const d = folder();
    const refuse = async (args: string[]): Promise<Record<string, unknown>> => {
      const r = await cli([...args, '--json'], d);
      expect(r.code, args.join(' ')).toBe(2);
      const j = json(r);
      expect(j, args.join(' ')).toMatchObject({ ok: false, reason: 'bad-usage', exitCode: 2 });
      return j;
    };
    expect((await refuse(['--list-templates'])).next).toEqual({ command: 'templates', args: [] });
    expect((await refuse(['--new', 'letter'])).next).toEqual({ command: 'new', args: ['letter.paged.md', '--template', 'letter'] });
    expect((await refuse(['--new', 'letter', '-o', 'my.md'])).next).toEqual({ command: 'new', args: ['my.paged.md', '--template', 'letter'] });
    const tpl = await refuse(['--template', 'exam-page', '--cdn']);
    expect(tpl.next).toEqual({ command: 'new', args: ['exam-page.paged.md', '--template', 'exam-page', '--html', '--cdn'] });
    expect(tpl.error).toMatch(/--template is gone since 1\.0/);
    write(join(d, 'mine.md'), '# Mine\n');
    const withText = await refuse(['mine.md', '--template', 'report-page']);
    expect(withText.next).toBeUndefined();
    expect(withText.error).toMatch(/Put `template: report-page` in the \{\{nyml\}\} header at the top of mine\.md/);
    const human = await cli(['--new', 'cv'], d);
    expect(human.stderr).toMatch(/orz-paged new cv\.paged\.md --template cv/);
    expect(readdirSync(d)).toEqual(['mine.md']); // nothing written
    // following next does what 0.x did: the starter text (and, for --template, its file)
    const n = tpl.next as { command: string; args: string[] };
    const r = await cli([n.command, ...n.args, '--json'], d);
    expect(r.code, r.stdout).toBe(0);
    expect(readHeader(text(join(d, 'exam-page.paged.md')))!.fields['template']).toBe('exam-page');
    expect(extract(text(join(d, 'exam-page.paged.html')))!.delivery).toBe('cdn');
  }, 240_000);

  it('[T.21] following every refusal\'s next verbatim never loses a text: two inputs to one -o, an input against another\'s twin, browser saves on the twin and on -o, both sides changed, a copied file — with and without uids, with and without git', async () => {
    let docs = 0;
    /** A text: with a well-formed uid in its header, or plain Markdown. */
    const docText = (title: string, uid: boolean): string => (uid
      ? `{{nyml\nkind: document\ncarrier: paged\nuid: doc-t21${String(++docs).padStart(7, '0')}\ntitle: ${title}\n}}\n\n# ${title}\n\n${title} body\n`
      : `# ${title}\n\n${title} body\n`);
    interface Scenario { d: string; env: NodeJS.ProcessEnv; texts: Map<string, string | null>; log: string[] }
    /** Every text the folder holds now: each file's own text, and the text each orz file holds (backups included). */
    const present = (s: Scenario): Set<string> => {
      const all = new Set<string>();
      for (const rel of readdirSync(s.d, { recursive: true }) as string[]) {
        if (/^\.(git|cache)(\/|$)/.test(rel)) continue;
        const path = join(s.d, rel);
        if (!statSync(path).isFile()) continue;
        const t = text(path);
        all.add(t);
        const held = extract(t);
        if (held) all.add(held.text);
      }
      return all;
    };
    /** A text is kept when it, or a later edit of it, still exists. */
    const kept = (s: Scenario, t: string, here: Set<string>): boolean => here.has(t) || [...s.texts].some(([child, parent]) => parent === t && kept(s, child, here));
    const lost = (s: Scenario): string[] => { const here = present(s); return [...s.texts.keys()].filter((t) => !kept(s, t, here)); };
    /** True when `t` is `of` or a later edit of it. */
    const descends = (s: Scenario, t: string, of: string): boolean => { for (let c: string | null | undefined = t; c; c = s.texts.get(c)) if (c === of) return true; return false; };
    /** The text files (x.paged.md) of the folder and what they hold. */
    const textFiles = (s: Scenario): Map<string, string> => new Map((readdirSync(s.d, { recursive: true }) as string[]).filter((rel) => !/^\.(git|cache)(\/|$)/.test(rel) && rel.endsWith('.md') && statSync(join(s.d, rel)).isFile()).map((rel) => [rel, text(join(s.d, rel))]));
    /** Run one command and check it: no text lost, and a text file it replaced now holds a later edit of its text (never another line of work). */
    const run = async (s: Scenario, args: string[]): Promise<Run> => {
      const before = textFiles(s);
      const r = await cli([...args, '--json'], s.d, s.env);
      s.log.push(`${args.join(' ')} -> ${r.code} ${r.code ? String(JSON.parse(r.stdout).reason) : ''}`);
      expect(lost(s), s.log.join('\n')).toEqual([]);
      for (const [rel, now] of textFiles(s)) {
        const was = before.get(rel);
        if (was !== undefined && was !== now) expect(descends(s, now, was), `${s.log.join('\n')}\n${rel}: ${JSON.stringify(was)} became ${JSON.stringify(now)}`).toBe(true);
      }
      return r;
    };
    /** The user (or the browser) writes a file: a text, or a .paged.html holding a text; `from` is the text it is an edit of. */
    const put = (s: Scenario, rel: string, t: string, from: string | null = null): void => {
      mkdirSync(join(s.d, rel, '..'), { recursive: true });
      write(join(s.d, rel), rel.endsWith('.paged.html') ? assemble(t, { delivery: 'cdn' }) : t);
      if (!s.texts.has(t)) s.texts.set(t, from);
    };
    /** Run a command; while it is refused with a next, run that next verbatim. No step may lose a text; a next never forces and ends in success. */
    const step = async (s: Scenario, args: string[]): Promise<Run> => {
      let r = await run(s, args);
      for (let depth = 0; r.code !== 0 && JSON.parse(r.stdout).next; depth++) {
        expect(depth, s.log.join('\n')).toBeLessThan(3);
        const next = JSON.parse(r.stdout).next as { command: string; args: string[] };
        expect(next.args, s.log.join('\n')).not.toContain('--force');
        s.log.push(`  next:`);
        r = await run(s, [next.command, ...next.args]);
        if (r.code !== 0) expect(JSON.parse(r.stdout).next, `${s.log.join('\n')}\n${r.stdout}`).toBeDefined();
      }
      return r;
    };
    const scenario = async (uid: boolean, withGit: boolean): Promise<{ s: Scenario; commit: (...files: string[]) => Promise<void> } | null> => {
      const d = folder();
      const git = withGit ? await gitIn(d) : null;
      if (withGit && !git) return null; // no git on this machine
      const s: Scenario = { d, env: { XDG_CACHE_HOME: join(d, '.cache') }, texts: new Map(), log: [`uid ${uid}, git ${withGit}`] };
      return { s, commit: async (...files) => { if (!git) return; expect((await git('add', ...files)).code).toBe(0); expect((await git('commit', '-q', '-m', 'c')).code).toBe(0); } };
    };
    for (const uid of [false, true]) {
      for (const withGit of [false, true]) {
        // 1. two inputs publish to one -o (the round-4 F1 repro): a.paged.md keeps its text whatever is followed
        const one = await scenario(uid, withGit);
        if (!one) continue;
        {
          const { s, commit } = one;
          const A = docText('A', uid);
          const B = docText('B', uid);
          put(s, 'a.paged.md', A);
          put(s, 'b.paged.md', B);
          await commit('a.paged.md', 'b.paged.md');
          expect((await step(s, ['assemble', 'a.paged.md', '-o', 'out/site.paged.html', '--cdn'])).code).toBe(0);
          await step(s, ['assemble', 'b.paged.md', '-o', 'out/site.paged.html']);
          await step(s, ['assemble', 'b.paged.md', '-o', 'out/site.paged.html', '--replaces', sha256(A)]); // what the refusal names
          const back = await step(s, ['assemble', 'a.paged.md', '-o', 'out/site.paged.html']);
          if (uid) expect(String(JSON.parse(back.stdout).error ?? ''), s.log.join('\n')).not.toMatch(/brings it into a\.paged\.md/);
          await step(s, ['extract', 'out/site.paged.html', '-o', 'a.paged.md']);
          await step(s, ['upgrade', 'out/site.paged.html', '--text', 'a.paged.md']);
          expect(text(join(s.d, 'a.paged.md')), s.log.join('\n')).toBe(A);
        }
        // 2. an input against another input's twin (y.paged.md -o x.paged.html), then x.paged.md and its twin
        const two = (await scenario(uid, withGit))!;
        {
          const { s, commit } = two;
          const X = docText('X', uid);
          const Y = docText('Y', uid);
          put(s, 'x.paged.md', X);
          put(s, 'y.paged.md', Y);
          await commit('x.paged.md', 'y.paged.md');
          expect((await step(s, ['assemble', 'x.paged.md', '--cdn'])).code).toBe(0);
          await step(s, ['assemble', 'y.paged.md', '-o', 'x.paged.html']);
          await step(s, ['assemble', 'y.paged.md', '-o', 'x.paged.html', '--replaces', sha256(X)]);
          await step(s, ['assemble', 'x.paged.md']);
          await step(s, ['extract', 'x.paged.html']);
          await step(s, ['upgrade', 'x.paged.html']);
          expect(text(join(s.d, 'x.paged.md')), s.log.join('\n')).toBe(X);
        }
        // 3. a browser save in the twin, then in an -o copy: the shortcut still brings the work in
        const three = (await scenario(uid, withGit))!;
        {
          const { s, commit } = three;
          const X = docText('X', uid);
          put(s, 'x.paged.md', X);
          await commit('x.paged.md');
          expect((await step(s, ['assemble', 'x.paged.md', '--cdn'])).code).toBe(0);
          put(s, 'x.paged.html', `${X}browser\n`, X);
          // uid'd: next is extract x.paged.html, then nothing left to do; uid-less: nothing proves the file is x.paged.md's
          // document (G1), so next is extract x.paged.html -o x.browser.paged.md — x.paged.md is never replaced automatically
          expect((await step(s, ['assemble', 'x.paged.md'])).code).toBe(0);
          expect(text(join(s.d, 'x.paged.md'))).toBe(uid ? `${X}browser\n` : X);
          if (!uid) expect(text(join(s.d, 'x.browser.paged.md'))).toBe(`${X}browser\n`);
          expect((await step(s, ['assemble', 'x.paged.md', '-o', 'pub/x.paged.html', '--cdn'])).code).toBe(0);
          const P = uid ? `${X}browser\npub\n` : `${X}pub\n`;
          put(s, 'pub/x.paged.html', P, uid ? `${X}browser\n` : X);
          expect((await step(s, ['assemble', 'x.paged.md', '-o', 'pub/x.paged.html'])).code).toBe(0);
          expect(text(join(s.d, 'x.paged.md'))).toBe(uid ? P : X);
        }
        // 4. both sides changed: the browser's and the agent's work both survive
        const four = (await scenario(uid, withGit))!;
        {
          const { s, commit } = four;
          const X = docText('X', uid);
          put(s, 'x.paged.md', X);
          await commit('x.paged.md');
          expect((await step(s, ['assemble', 'x.paged.md', '--cdn'])).code).toBe(0);
          put(s, 'x.paged.html', `${X}browser\n`, X);
          put(s, 'x.paged.md', `${X}agent\n`, X);
          await step(s, ['assemble', 'x.paged.md']);
          await step(s, ['extract', 'x.paged.html']);
          await step(s, ['upgrade', 'x.paged.html']);
          expect(text(join(s.d, 'x.paged.md'))).toBe(`${X}agent\n`);
        }
        // 5. another document's file copied over the twin (round 5, G1): y.paged.html (assembled from y.paged.md) copied onto
        // x.paged.html — with and without a record of x.paged.md's pair (c1, c3), y's text with or without a uid (c3, c4: a
        // uid'd x.paged.md against a uid-less file), x.paged.md committed or not (c4: git vouches for x.paged.md). x.paged.md keeps its text
        for (const yUid of [false, true]) {
          for (const record of [false, true]) {
            const s = (await scenario(uid, withGit))!;
            s.s.log.push(`copied file: y uid ${yUid}, record ${record}`);
            const X = docText('X', uid);
            const Y = docText('Y', yUid);
            put(s.s, 'x.paged.md', X);
            put(s.s, 'y.paged.md', Y);
            await s.commit('x.paged.md', 'y.paged.md');
            if (record) expect((await step(s.s, ['assemble', 'x.paged.md', '--cdn'])).code).toBe(0);
            expect((await step(s.s, ['assemble', 'y.paged.md', '--cdn'])).code).toBe(0);
            copyFileSync(join(s.s.d, 'y.paged.html'), join(s.s.d, 'x.paged.html'));
            // assemble never calls this "only the file changed" (no plain extract x.paged.html: it would bring Y into x.paged.md)
            const asked = await run(s.s, ['assemble', 'x.paged.md']);
            expect(JSON.parse(asked.stdout).next?.args, s.s.log.join('\n')).not.toEqual(['x.paged.html']);
            // extract and upgrade, run directly (before any next re-anchors the file's last writer), keep x.paged.md
            await step(s.s, ['extract', 'x.paged.html']);
            await step(s.s, ['upgrade', 'x.paged.html']);
            await step(s.s, ['assemble', 'x.paged.md']);
            expect(text(join(s.s.d, 'x.paged.md')), s.s.log.join('\n')).toBe(X);
          }
        }
        // 6. two inputs to one -o with a record that could not follow (round 5, G2): a read-only cache (c5), or two
        // caches (c6: two users or machines) — the stale last writer never makes a.paged.md take b.paged.md's text
        for (const split of [false, true]) {
          if (!split && process.getuid?.() === 0) continue; // root writes a read-only cache anyway
          const s = (await scenario(uid, withGit))!;
          s.s.log.push(split ? 'two caches' : 'read-only cache');
          const A = docText('A', uid);
          const B = docText('B', uid);
          put(s.s, 'a.paged.md', A);
          put(s.s, 'b.paged.md', B);
          await s.commit('a.paged.md', 'b.paged.md');
          const own = s.s.env;
          const cacheRoot = join(s.s.d, '.cache');
          try {
            expect((await step(s.s, ['assemble', 'a.paged.md', '-o', 'site.paged.html', '--cdn'])).code).toBe(0);
            if (split) s.s.env = { XDG_CACHE_HOME: join(s.s.d, '.cache', 'm2') };
            else for (const dir of [cacheRoot, join(cacheRoot, 'orz-paged'), join(cacheRoot, 'orz-paged', 'pairs'), join(cacheRoot, 'orz-paged', 'files')]) chmodSync(dir, 0o555);
            expect((await step(s.s, ['assemble', 'b.paged.md', '-o', 'site.paged.html', '--replaces', sha256(A)])).code).toBe(0);
            s.s.env = own;
            await step(s.s, ['assemble', 'a.paged.md', '-o', 'site.paged.html']);
            await step(s.s, ['extract', 'site.paged.html', '-o', 'a.paged.md']);
            await step(s.s, ['upgrade', 'site.paged.html', '--text', 'a.paged.md']);
            expect(text(join(s.s.d, 'a.paged.md')), s.s.log.join('\n')).toBe(A);
          } finally {
            for (const dir of [cacheRoot, join(cacheRoot, 'orz-paged'), join(cacheRoot, 'orz-paged', 'pairs'), join(cacheRoot, 'orz-paged', 'files')]) if (existsSync(dir)) chmodSync(dir, 0o755);
          }
        }
      }
    }
  }, 600_000);
});
