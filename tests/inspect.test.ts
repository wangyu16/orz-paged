/**
 * inspect: the agent-facing diagnosis (claims I.1–I.5).
 */
import { describe, it, expect } from 'vitest';
import { assembleEnvelope } from 'orz-markdown/carrier';
import { inspect } from '../src/inspect.js';
import { assemble, newDocument, storedText } from '../src/assemble.js';
import { sha256 } from 'orz-markdown/carrier';
import { VERSION } from '../src/version.js';
import { corpus, ENGINE, LEGACY_FILES, read, legacySourceOf, withLegacySource } from './helpers.js';

const UID = 'doc-inspect00000001';

describe('inspect', () => {
  it('[I.1] an assembled format-1 file: markers, identity, settings, checks; advice for older and newer shells', () => {
    const text = newDocument({ template: 'exam-page', title: 'Inspected', theme: 'light-neat-1', uid: UID });
    const r = inspect(assemble(text, { engineSource: ENGINE, includes: { './a.md': 'A\n', './b.md': 'B\n' } }), { engineSource: ENGINE });
    expect(r).toMatchObject({
      input: 'assembled', kind: 'paged', format: 1, writable: true, uid: UID, title: 'Inspected', theme: 'light-neat-1', template: 'exam-page', includes: 2, legacy: null,
      shell: { version: VERSION, generator: `orz-paged ${VERSION}`, delivery: 'inline', relation: 'same' },
      header: { present: true, legacy: null, keys: ['carrier', 'uid', 'title', 'template', 'page_number_position', 'page_number_style', 'dynamic_choices', 'theme'] },
      settings: { template: 'exam-page', page_number_position: 'footer-center', page_number_style: 'page-n-of-N', dynamic_choices: 'answer-key: hide' },
      checks: { island: 'closed', end: 'closed', engine: 'same' },
      lint: [],
      advice: [],
      sha256: sha256(text),
    });
    const cdn = inspect(assemble(text, { delivery: 'cdn' }));
    expect(cdn.shell!.delivery).toBe('cdn');
    expect(cdn.checks!.engine).toBe('cdn');
    expect(cdn.includes).toBe(0);
    // an altered inline engine, a cut file
    const altered = inspect(assemble(text, { engineSource: 'void 1;' }), { engineSource: ENGINE });
    expect(altered.checks!.engine).toBe('different');
    expect(altered.advice.join('\n')).toMatch(/not orz-paged .* release bundle/);
    const html = assemble(text, { delivery: 'cdn' });
    const cut = inspect(html.slice(0, html.indexOf('</script>', html.indexOf('id="orz-src"'))));
    expect(cut.checks!.island).toBe('unclosed');
    expect(cut.writable).toBe(false);
    // older and newer shells
    const older = inspect(html.replace(`"shell":"${VERSION}"`, '"shell":"0.0.1"'));
    expect(older.shell!.relation).toBe('older');
    expect(older.advice.join('\n')).toMatch(/older than this tool.*orz-paged upgrade/);
    const newer = inspect(html.replace(`"shell":"${VERSION}"`, '"shell":"99.0.0"'));
    expect(newer.shell!.relation).toBe('newer');
    expect(newer.writable).toBe(false);
    expect(newer.advice.join('\n')).toMatch(/newer orz-paged \(99\.0\.0\)/);
    // another kind's file
    const md = inspect(assembleEnvelope('{{nyml\nkind: document\ntitle: Notes\n}}\n\n# Notes\n', { kind: 'md', shellVersion: '1.0.0', headHtml: '', bodyHtml: '' }));
    expect(md).toMatchObject({ input: 'assembled', kind: 'md', writable: false, settings: {} });
    expect(md.advice.join('\n')).toMatch(/use orz-mdhtml/);
  });

  it('[I.2] a legacy 0.x file: version, delivery, title, #orz-meta keys, where its settings are; not writable; upgrade advice', () => {
    for (const [name, path] of Object.entries(LEGACY_FILES)) {
      const html = read(path);
      const r = inspect(html);
      expect(r.input, name).toBe('legacy');
      expect(r.kind).toBe('paged');
      expect(r.format).toBeNull();
      expect(r.writable).toBe(false);
      expect(r.shell).toBeNull();
      expect(r.legacy).toMatchObject({ version: '0.7.3', generator: 'orz-paged 0.7.3', delivery: 'cdn', settings: 'header' });
      expect(r.sha256).toBe(sha256(legacySourceOf(html)));
      expect(r.advice[0]).toMatch(/legacy orz-paged 0\.7\.3 file.*`orz-paged upgrade file\.paged\.html`/);
    }
    expect(inspect(read(LEGACY_FILES['lib-metadata']!)).legacy).toMatchObject({ title: 'Lib Metadata', metaKeys: ['title', 'author', 'date', 'keywords', 'license', 'source'], meta: 'none' });
    expect(inspect(read(LEGACY_FILES['metadata']!)).legacy!.meta).toBe('header');
    const exam = inspect(read(LEGACY_FILES['exam-page']!), { filename: 'exam.paged.html' });
    expect(exam).toMatchObject({ title: 'Course Name — Exam 1', template: 'exam-page' });
    expect(exam.advice[0]).toMatch(/orz-paged upgrade exam\.paged\.html/);
    // settings in the body: reported where they are, the facts read as upgrade would arrange them
    const later = inspect(withLegacySource(read(LEGACY_FILES['letter']!), read('tests/fixtures/legacy/synthetic-meta-first.md')));
    expect(later.legacy).toMatchObject({ settings: 'body', meta: 'header' }); // the meta block leads (a lone legacy header), the settings block is later
    expect(later).toMatchObject({ title: 'Meta Before Settings', template: 'exam-section', settings: { page_size: 'A5' } });
    // a custom_css `}}` is reported
    expect(inspect(withLegacySource(read(LEGACY_FILES['letter']!), read('tests/fixtures/legacy/synthetic-css-braces.md'))).notes.join('\n')).toMatch(/`}}` inside `custom_css`/);
    // next to a text twin: upgrade to another name and merge
    const twin = inspect(read(LEGACY_FILES['sample']!), { filename: 'sample.paged.html', twin: { name: 'sample.paged.md', content: read('tests/fixtures/legacy/sample.md') } });
    expect(twin.advice[0]).toMatch(/--text sample\.browser\.paged\.md/);
  });

  it('[I.3] texts: corpus, plain Markdown, newer format, other kinds, lint errors, stray settings blocks', () => {
    for (const c of corpus('paged')) {
      const r = inspect(c.text, { filename: c.path });
      expect(r.input, c.path).toBe('text');
      expect(r.kind).toBe('paged');
      expect(r.format).toBe(1);
      expect(r.writable).toBe(true);
      expect(r.title).toBe(c.derivedTitle);
      expect(r.uid).toBe(c.header.uid);
      expect(r.header!.keys.filter((k) => k !== 'format')).toEqual(c.keys.filter((k) => k !== 'format'));
      expect(r.sha256).toBe(sha256(c.text));
      expect(r.advice.join('\n')).toMatch(/orz-paged assemble/);
    }
    const plain = inspect('# Just Markdown\n\nNothing else.\n');
    expect(plain).toMatchObject({ input: 'text', kind: 'paged', format: 1, uid: null, title: 'Just Markdown', header: { present: false, keys: [] }, includes: 0, template: null });
    const asMd = inspect('# Notes\n', { filename: 'notes.md' });
    expect(asMd.kind).toBe('md');
    expect(asMd.advice.join('\n')).toMatch(/use orz-mdhtml/);
    const future = inspect('{{nyml\nkind: document\nformat: 2\n}}\n\nx\n');
    expect(future.writable).toBe(false);
    expect(future.advice.join('\n')).toMatch(/format 2 is newer/);
    const bad = inspect('{{nyml\nkind: document\nuid: nope\n}}\n\nx\n');
    expect(bad.advice.join('\n')).toMatch(/lint errors.*bad-uid/);
    const stray = inspect('# Title\n\n{{nyml\nkind: document\npage_size: A5\n}}\n');
    expect(stray.advice.join('\n')).toMatch(/not at the top of the text is not the settings source/);
    const misspelt = inspect('{{nyml\nkind: document\npage_sise: A5\n}}\n');
    expect(misspelt.lint.map((l) => l.code)).toContain('unknown-key');
    // the twin check
    const text = newDocument({ uid: UID });
    const same = inspect(text, { filename: 'n.paged.md', twin: { name: 'n.paged.html', content: assemble(text, { delivery: 'cdn' }), newer: 'input' } });
    expect(same.twin).toEqual({ name: 'n.paged.html', holds: 'same', newer: 'input', sha256: sha256(storedText(text)) });
    const diff = inspect(text, { filename: 'n.paged.md', twin: { name: 'n.paged.html', content: assemble(text + 'more\n', { delivery: 'cdn' }), newer: 'twin' } });
    expect(diff.twin!.holds).toBe('different');
    expect(diff.advice.join('\n')).toMatch(/orz-paged extract n\.paged\.html -o n\.browser\.paged\.md/);
    const earlier = inspect(text, { filename: 'n.paged.md', twin: { name: 'n.paged.html', content: assemble(text + 'old\n', { delivery: 'cdn' }), earlier: 'git-head' } });
    expect(earlier.twin!.earlier).toBe('git-head');
  });

  it('[I.4] HTML that is not an orz file, and an empty file', () => {
    expect(inspect('<!doctype html><html><body><p>hi</p></body></html>')).toMatchObject({ input: 'html', kind: null, format: null, writable: false, sha256: null });
    const unknown = inspect('<!doctype html><html><body><script type="text/markdown" id="orz-src">x</script></body></html>');
    expect(unknown.input).toBe('html');
    expect(unknown.notes.join('\n')).toMatch(/unknown writer/);
    expect(inspect('', { filename: 'x.paged.html' }).advice.join('\n')).toMatch(/empty/);
  });

  it('[I.5] the report is plain JSON data and deterministic', () => {
    const inputs = [newDocument({ uid: UID }), assemble(newDocument({ uid: UID }), { delivery: 'cdn' }), read(LEGACY_FILES['metadata']!), '<!doctype html><html></html>'];
    for (const input of inputs) {
      const r = inspect(input);
      expect(JSON.parse(JSON.stringify(r))).toEqual(r);
      expect(inspect(input)).toEqual(r);
    }
  });
});
