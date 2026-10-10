/**
 * upgrade: legacy 0.x files to text format 1 (claims U.1–U.7), on real 0.7.3
 * files (tests/fixtures/legacy, made with the 0.7.3 CLI and library before
 * the rebuild changed them) and on synthetic ones made from them by
 * replacing the island the 0.x way.
 */
import { describe, it, expect } from 'vitest';
import { lintHeader, readHeader, withoutHeader, UID_PATTERN } from 'orz-markdown/carrier';
import { upgrade, readLegacy, headerFromLegacySource, assertKeepsLegacySource } from '../src/legacy.js';
import { inspect } from '../src/inspect.js';
import { assemble, extract, readDocument, newDocument } from '../src/assemble.js';
import { resolveSettings } from '../src/doc/settings.js';
import { ENGINE, LEGACY_FILES, HAZARDS, read, legacySourceOf, withLegacySource } from './helpers.js';

const UID = 'doc-upgraded0000001';
const SAMPLE_HTML = read(LEGACY_FILES['sample']!);
const META_HTML = read(LEGACY_FILES['metadata']!);
const LIB_HTML = read(LEGACY_FILES['lib-metadata']!);
const LETTER_HTML = read(LEGACY_FILES['letter']!);
const ink = (s: string): string => s.replace(/\s+/g, '');

/** Every non-whitespace character of `source` is in `text` (as a multiset). */
function expectInkKept(text: string, source: string, allowDropped = ''): void {
  const pool = new Map<string, number>();
  for (const c of ink(text) + ink(allowDropped)) pool.set(c, (pool.get(c) ?? 0) + 1);
  for (const c of ink(source)) {
    const n = pool.get(c) ?? 0;
    expect(n, `character ${JSON.stringify(c)} lost`).toBeGreaterThan(0);
    pool.set(c, n - 1);
  }
}

describe('upgrade on the real 0.7.3 files', () => {
  it('[U.1] a source whose settings block already leads keeps it as the header: the text is the source plus header lines, nothing else changes', () => {
    for (const [name, path] of Object.entries(LEGACY_FILES)) {
      const html = read(path);
      const source = legacySourceOf(html);
      expect(readLegacy(html)!.text === source, name).toBe(true);
      const u = upgrade(html, { delivery: 'cdn', uid: UID });
      expect(u.from).toBe('legacy');
      // the body after the header is the source's body exactly
      expect(withoutHeader(u.text).body, name).toBe(withoutHeader(source).body);
      // the source's header lines are all still in the one header (a meta+settings pair: settings lines first, FC-18 §5)
      const srcHeader = source.slice(0, readHeader(source)!.end);
      const lines = srcHeader.split('\n').filter((l) => l.trim() !== '' && !/^\{\{nyml|^\}\}|^kind:/.test(l));
      const outLines = u.text.slice(0, readHeader(u.text)!.end).split('\n');
      for (const l of lines) expect(outLines, `${name}: ${l}`).toContain(l);
      expectInkKept(u.text, source, '{{nyml kind: meta }}');
      expect(lintHeader(u.text, 'paged'), name).toEqual([]);
    }
    // where the original text is at hand, it is that text byte for byte after the header
    expect(withoutHeader(upgrade(SAMPLE_HTML, { delivery: 'cdn', uid: UID }).text).body).toBe(withoutHeader(read('tests/fixtures/legacy/sample.md')).body);
    expect(withoutHeader(upgrade(META_HTML, { delivery: 'cdn', uid: UID }).text).body).toBe(withoutHeader(read('tests/fixtures/legacy/metadata.md')).body);
  });

  it('[U.2] one header: settings and metadata merged (kit editHeader), carrier paged, a uid; #orz-meta and a lone <title> move in; the settings mean what they meant', () => {
    // CLI file: the kind: meta block and the settings block lead the source → one header
    const m = upgrade(META_HTML, { delivery: 'cdn', uid: UID });
    const h = readHeader(m.text)!;
    expect(h.legacy).toBeNull();
    expect(h.blocks).toHaveLength(1);
    expect(h.keys).toEqual(['template', 'page_size', 'custom_css', 'title', 'author', 'license', 'keywords', 'date', 'carrier', 'uid']);
    expect(h.fields).toMatchObject({ carrier: 'paged', uid: UID, title: 'Legacy Report With Metadata', author: 'Ada Lovelace', page_size: 'Letter', custom_css: '.note { color: #333; }' });
    expect(m.text.startsWith('{{nyml\nkind: document\ntemplate: report-section\n')).toBe(true);
    expect(resolveSettings(m.text)).toMatchObject({ template: 'report-section', pageSize: 'Letter', customCss: '.note { color: #333; }' });
    expect(m.moved).toEqual({ carrier: 'paged', uid: UID });
    // library file: the meta block was consumed into #orz-meta (host metadata won) → moved from there
    const l = upgrade(LIB_HTML, { delivery: 'cdn', uid: UID });
    expect(readHeader(l.text)!.fields).toMatchObject({ carrier: 'paged', uid: UID, title: 'Legacy Report With Metadata', author: 'Host Author', source: 'https://example.org/doc', license: 'CC-BY-4.0', keywords: 'legacy, paged, upgrade', date: '2026-07-01', template: 'report-section' });
    expect(readDocument(l.text).meta).toMatchObject({ author: 'Host Author', keywords: ['legacy', 'paged', 'upgrade'], license: { spdx: 'CC-BY-4.0' } });
    // a minted uid without injection
    expect(readHeader(upgrade(META_HTML, { delivery: 'cdn' }).text)!.fields['uid']).toMatch(UID_PATTERN);
    // <title>: the CLI's file name does not override the document's own title; it does name an untitled one
    const s = upgrade(SAMPLE_HTML, { delivery: 'cdn', uid: UID });
    expect(readDocument(s.text).title).toBe('A Paged Document Demo');
    expect(readHeader(s.text)!.fields['title']).toBeUndefined();
    expect(s.notes.join('\n')).toMatch(/<title> "sample".*not moved/);
    expect(readHeader(upgrade(LETTER_HTML, { delivery: 'cdn', uid: UID }).text)!.fields['title']).toBe('letter');
  });

  it('[U.4] the file is the text\'s assembly and extracts back exactly; upgrading again changes nothing', () => {
    for (const [name, path] of Object.entries(LEGACY_FILES)) {
      for (const o of [{ delivery: 'cdn' as const }, { engineSource: ENGINE }]) {
        const u = upgrade(read(path), { ...o, uid: UID });
        expect(u.html === assemble(u.text, o), name).toBe(true);
        expect(extract(u.html)!.text === u.text, name).toBe(true);
        expect(inspect(u.html)).toMatchObject({ input: 'assembled', kind: 'paged', format: 1, uid: UID, writable: true });
        const again = upgrade(u.html, o);
        expect(again).toEqual({ text: u.text, html: u.html, from: 'format-1', moved: {}, notes: [] });
      }
    }
    const withIncludes = assemble(newDocument({ uid: UID }), { delivery: 'cdn', includes: { './x.md': 'X\r\n' } });
    expect(upgrade(withIncludes, { delivery: 'cdn' }).html).toBe(withIncludes);
  });
});

describe('upgrade on synthetic 0.x files', () => {
  it('[U.3] a kind: meta block before the settings block, apart from it: both move to the top as ONE header (settings lines first), the rest of the text stays', () => {
    const source = read('tests/fixtures/legacy/synthetic-meta-first.md');
    const u = upgrade(withLegacySource(LETTER_HTML, source), { delivery: 'cdn', uid: UID });
    const h = readHeader(u.text)!;
    expect(h.legacy).toBeNull();
    expect(h.keys).toEqual(['template', 'page_size', 'dynamic_choices', 'title', 'author', 'license', 'keywords', 'carrier', 'uid']);
    expect(h.fields).toMatchObject({ template: 'exam-section', page_size: 'A5', dynamic_choices: 'answer-key: show', title: 'Meta Before Settings', author: 'Grace Hopper', keywords: 'compilers; navy' });
    expect(withoutHeader(u.text).body).toBe(
      '\n\n<!-- an editor\'s comment between the blocks -->\n\nIntro paragraph before the settings block.\n\n{{nyml\nkind: exam-title\ntitle: Quiz on Compilers\n}}\n\n## Question\n\nText.\n',
    );
    expect(u.notes.join('\n')).toMatch(/moved the `kind: document` block and the `kind: meta` block to the top/);
    expect(lintHeader(u.text, 'paged')).toEqual([]);
    expect(resolveSettings(u.text)).toMatchObject({ template: 'exam-section', pageSize: 'A5', dynamicChoices: { answer_key: 'show' } });
    expectInkKept(u.text, source, '{{nyml kind: meta }}');
    // a settings block after body text (0.x read it anywhere)
    const later = upgrade(withLegacySource(LETTER_HTML, '# First\n\nText.\n\n{{nyml\nkind: document\npage_size: A5\n}}\n\nMore.\n'), { delivery: 'cdn', uid: UID });
    expect(later.text).toBe(`{{nyml\nkind: document\npage_size: A5\ncarrier: paged\nuid: ${UID}\n}}\n\n# First\n\nText.\n\nMore.\n`);
    // CR LF sources keep their line ending in the moved header
    const crlf = upgrade(withLegacySource(LETTER_HTML, '{{nyml\r\nkind: meta\r\ntitle: CR\r\n}}\r\n\r\nx\r\n\r\n{{nyml\r\nkind: document\r\npage_size: A5\r\n}}\r\n\r\nbody\r\n'), { delivery: 'cdn', uid: UID });
    expect(crlf.text).toBe(`{{nyml\r\nkind: document\r\npage_size: A5\r\ntitle: CR\r\ncarrier: paged\r\nuid: ${UID}\r\n}}\r\n\r\nx\r\n\r\nbody\r\n`);
    // a clash: the settings block wins, the meta value is named in the notes
    const clash = upgrade(withLegacySource(LETTER_HTML, '{{nyml\nkind: document\ntitle: Doc T\n}}\n{{nyml\nkind: meta\ntitle: Meta T\nauthor: A\n}}\n\nbody\n'), { delivery: 'cdn', uid: UID });
    expect(readHeader(clash.text)!.fields).toMatchObject({ title: 'Doc T', author: 'A' });
    expect(clash.notes.join('\n')).toMatch(/kind: meta` title "Meta T" was not kept/);
  });

  it('[U.5] a custom_css with `}}` is made safe as `} }` (the same CSS), reported; no text is lost', () => {
    const source = read('tests/fixtures/legacy/synthetic-css-braces.md');
    // the 0.x reader and the format-1 reader both end the block at the first `}}`
    expect(lintHeader(source, 'paged').map((l) => l.code)).toContain('closer-in-value');
    const u = upgrade(withLegacySource(LETTER_HTML, source), { delivery: 'cdn', uid: UID });
    const h = readHeader(u.text)!;
    expect(h.fields['custom_css']).toBe('@media print { .orz-doc h2 { color: #333; } }\n.cols { display: grid; }\n  } }\n.after { margin: 0; }');
    expect(h.fields['footer_left']).toBe('Draft');
    expect(lintHeader(u.text, 'paged')).toEqual([]);
    expect(u.notes.join('\n')).toMatch(/`}}` inside `custom_css` \(2×\).*written `} }`, the same CSS/);
    expect(withoutHeader(u.text).body).toBe('\n\n# CSS With Braces\n\nThe settings block above holds `}}` inside custom_css.\n');
    expectInkKept(u.text, source);
    expect(resolveSettings(u.text).customCss).toContain('.after { margin: 0; }');
    // a `}}` that really ends the block (body text follows) is not touched
    const real = headerFromLegacySource('{{nyml\nkind: document\nfooter_left: x}}\n\n# Body\n');
    expect(real.text).toBe('{{nyml\nkind: document\nfooter_left: x}}\n\n# Body\n');
  });

  it('[U.7] the `}}` repair runs only when the lines up to the lone `}}` are indented or blank (the rest of a value): with a bare `key:` line between (F7) nothing is repaired — the block ends where 0.x ended it, the lines stay body text — and a note says so; no text is lost', () => {
    const source = '{{nyml\nkind: document\ncustom_css: |\n  .a { color: red; }}\nNote: this line was body text in 0.x\n}}\n\n# Body\n';
    const r = headerFromLegacySource(source);
    expect(r.text).toBe(source);
    expect(r.notes.join('\n')).toMatch(/a lone `\}\}` follows after a `Note:` line: not repaired/);
    const u = upgrade(withLegacySource(LETTER_HTML, source), { delivery: 'cdn', uid: UID });
    expect(withoutHeader(u.text).body).toContain('Note: this line was body text in 0.x\n}}\n\n# Body\n');
    expect(u.notes.join('\n')).toMatch(/not repaired/);
    expectInkKept(u.text, source);
    // indented continuation lines only: repaired as before
    const fixed = headerFromLegacySource('{{nyml\nkind: document\ncustom_css: |\n  .a { color: red; }}\n  .b { margin: 0; }\n}}\n\n# Body\n');
    expect(readHeader(fixed.text)!.fields['custom_css']).toBe('.a { color: red; } }\n.b { margin: 0; }');
    // the lone closing `}}` may carry trailing spaces or a tab (mutant U6): still the intended end
    for (const closer of ['}}  ', '}}\t', '}} \t ']) {
      const t = headerFromLegacySource(`{{nyml\nkind: document\ncustom_css: |\n  .a { color: red; }}\n  .b { margin: 0; }\n${closer}\n\n# Body\n`);
      expect(readHeader(t.text)!.fields['custom_css'], JSON.stringify(closer)).toBe('.a { color: red; } }\n.b { margin: 0; }');
      expect(withoutHeader(t.text).body, JSON.stringify(closer)).toBe(`${closer.slice(2)}\n\n# Body\n`); // the trailing blanks kept: no character is dropped
    }
  });

  it('[U.7] F6: a `{{nyml kind: document}}` block inside a code block or an HTML comment — the one 0.x applied (it read the raw text) — is noted: format 1 does not read it there', () => {
    const fenced = '# Doc\n\n```\n{{nyml\nkind: document\npage_size: A5\n}}\n```\n\ntext\n';
    const a = upgrade(withLegacySource(LETTER_HTML, fenced), { delivery: 'cdn', uid: UID });
    expect(a.notes.join('\n')).toMatch(/0\.x read its settings from the `\{\{nyml kind: document\}\}` block at line 4, inside a code block or an HTML comment/);
    expect(resolveSettings(a.text).pageSize).toBe('A4');
    expectInkKept(a.text, fenced);
    const commented = '<!--\n{{nyml\nkind: document\ntheme: light-neat-1\n}}\n-->\n\n{{nyml\nkind: document\npage_size: A5\n}}\n\nx\n';
    const c = upgrade(withLegacySource(LETTER_HTML, commented), { delivery: 'cdn', uid: UID });
    expect(c.notes.join('\n')).toMatch(/block at line 2, inside a code block or an HTML comment.*\(the block at line 8 is the header now\)/);
    // the usual case says nothing of it
    const plain = upgrade(withLegacySource(LETTER_HTML, '{{nyml\nkind: document\npage_size: A5\n}}\n\nx\n'), { delivery: 'cdn', uid: UID });
    expect(plain.notes.join('\n')).not.toMatch(/raw text/);
  });

  it('[U.7] the "never lose text" net throws when the body is not the arranged source exactly (P02) or a character is missing, counting each dropped character once (P03)', () => {
    const arranged = '{{nyml\nkind: document\ntitle: T\n}}\n\nbody one\n';
    // what upgrade writes: header lines added, the body kept
    expect(() => assertKeepsLegacySource(arranged, arranged, '{{nyml\nkind: document\ncarrier: paged\ntitle: T\n}}\n\nbody one\n', [])).not.toThrow();
    // every character is there, but the body changed (reordered): refused
    expect(() => assertKeepsLegacySource(arranged, arranged, '{{nyml\nkind: document\ntitle: T\n}}\n\none body\n', [])).toThrow(/does not keep the legacy source/);
    // a character lost from the source: refused
    expect(() => assertKeepsLegacySource('{{nyml\nkind: document\ntitle: TT\n}}\n\nbody one\n', arranged, arranged, [])).toThrow(/does not keep/);
    // a dropped entry covers its characters once, not more
    expect(() => assertKeepsLegacySource('{{nyml\nkind: document\ntitle: T\nzq\n}}\n\nbody one\n', arranged, arranged, ['zq'])).not.toThrow();
    expect(() => assertKeepsLegacySource('{{nyml\nkind: document\ntitle: T\nzzq\n}}\n\nbody one\n', arranged, arranged, ['zq'])).toThrow(/does not keep/);
  });

  it('[U.1] hazard sources survive the 0.x escaping and the upgrade', () => {
    const sources = {
      ...HAZARDS,
      'script-close-cases': '# T\n\n</script> </SCRIPT> </Script > <script>x</script>\n',
      crlf: '# CR LF\r\n\r\nline two\r\n',
      'blank-edges': '\n\n# padded\n\n\n',
    };
    for (const [name, source] of Object.entries(sources)) {
      if (/<\\\/script/i.test(source)) continue; // the 0.x format cannot carry a literal `<\/script` (U.6)
      if (/\{\{nyml/.test(source) && !source.startsWith('{{nyml') && !source.startsWith('﻿{{nyml')) continue;
      const html = withLegacySource(LETTER_HTML, source);
      expect(legacySourceOf(html), name).toBe(source);
      const u = upgrade(html, { delivery: 'cdn', uid: UID });
      expectInkKept(u.text, source);
      expect(extract(u.html)!.text === u.text, name).toBe(true);
      expect(readHeader(u.text)!.fields['carrier'], name).toBe('paged');
    }
  }, 120_000);

  it('[U.6] unrecognised things are kept or noted, never dropped silently; non-orz input is refused', () => {
    // an island without the 0.x wrapper: kept exactly, noted
    const unwrapped = LETTER_HTML.replace(/(<script type="text\/markdown" id="orz-src">)\n/, '$1');
    const lu = readLegacy(unwrapped)!;
    expect(lu.wrapped).toBe(false);
    expect(inspect(unwrapped).notes.join('\n')).toMatch(/wrapper/);
    expect(upgrade(unwrapped, { delivery: 'cdn', uid: UID }).notes.join('\n')).toMatch(/wrapper/);
    // `<\/script` (the 0.x escape): restored to `</script`, noted; a literal `<\/script` cannot be told apart (the 0.x format's limit)
    expect(readLegacy(META_HTML)!.scriptEscapes).toBe(1);
    expect(readLegacy(META_HTML)!.notes.join('\n')).toMatch(/restored to `<\/script`/);
    expect(readLegacy(withLegacySource(LETTER_HTML, 'a <\\/script> b\n'))!.text).toBe('a </script> b\n');
    // a meta value the header cannot hold: left out, noted
    const curly = LIB_HTML.replace('"author": "Host Author"', '"author": "Host }} Author"');
    const c = upgrade(curly, { delivery: 'cdn', uid: UID });
    expect(readHeader(c.text)!.fields['author']).toBeUndefined();
    expect(c.notes.join('\n')).toMatch(/author not moved/);
    // an invalid #orz-meta uid: a new one, noted
    const badUid = LIB_HTML.replace('"title": "Legacy Report With Metadata",', '"title": "Legacy Report With Metadata",\n  "uid": "not-a-uid",');
    const b = upgrade(badUid, { delivery: 'cdn', uid: UID });
    expect(readHeader(b.text)!.fields['uid']).toBe(UID);
    expect(b.notes.join('\n')).toMatch(/not-a-uid.*not a valid uid/);
    const goodUid = LIB_HTML.replace('"title": "Legacy Report With Metadata",', '"title": "Legacy Report With Metadata",\n  "uid": "doc-fromthemeta0001",');
    expect(readHeader(upgrade(goodUid, { delivery: 'cdn', uid: UID }).text)!.fields['uid']).toBe('doc-fromthemeta0001');
    // a settings block that cannot move exactly (inside a blockquote): stays, noted
    const quoted = upgrade(withLegacySource(LETTER_HTML, '> {{nyml\n> kind: document\n> page_size: A5\n> }}\n\nbody\n'), { delivery: 'cdn', uid: UID });
    expect(quoted.text).toContain('> {{nyml\n> kind: document\n> page_size: A5\n> }}');
    expect(quoted.notes.join('\n')).toMatch(/could not be moved/);
    // a second settings block (0.x ignored it): stays in the body, noted
    const two = upgrade(withLegacySource(LETTER_HTML, '{{nyml\nkind: document\npage_size: A5\n}}\n\n{{nyml\nkind: document\npage_size: A3\n}}\n\nx\n'), { delivery: 'cdn', uid: UID });
    expect(readHeader(two.text)!.fields['page_size']).toBe('A5');
    expect(two.text).toContain('page_size: A3');
    expect(two.notes.join('\n')).toMatch(/1 more `\{\{nyml kind: document\}\}` block/);
    // an inline 0.x file (engine inlined, `<script` strings inside it)
    const inline = LETTER_HTML.replace(/<script data-orz-asset="engine" src="[^"]*"><\/script>/, '<script data-orz-asset="engine">var s="<\\/script><script>";</script>');
    expect(readLegacy(inline)!.delivery).toBe('inline');
    expect(upgrade(inline, { delivery: 'cdn', uid: UID }).text).toBe(upgrade(LETTER_HTML, { delivery: 'cdn', uid: UID }).text);
    // unreadable config: noted, still upgraded
    const broken = LETTER_HTML.replace('window.__ORZ_PAGED__ = {', 'window.__ORZ_PAGED__ = {,');
    expect(readLegacy(broken)!.notes.join('\n')).toMatch(/config/);
    expect(readLegacy(broken)!.version).toBe('0.7.3');
    // non-orz input, another kind
    expect(() => upgrade('<!doctype html><html><body>hi</body></html>')).toThrow(/not an orz-paged file/);
    expect(() => upgrade('# plain text\n')).toThrow(/not an orz-paged file/);
    expect(readLegacy(LETTER_HTML.replace(/<meta name="generator" content="orz-paged [^"]*">/, '<meta name="generator" content="orz-mdhtml">').replace('window.__ORZ_PAGED__', 'window.__ORZ_MDHTML__'))).toBeNull();
  });
});
