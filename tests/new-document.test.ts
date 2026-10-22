/**
 * newDocument: the creation tool's text, from the template skeletons
 * (claims N.1–N.5).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { lintHeader, readHeader, UID_PATTERN } from 'orz-markdown/carrier';
import { newDocument, readDocument, assemble, extract, letterDate, markdownLiteral, replacePlaceholderTitle, DEFAULT_TEMPLATE, STARTER_DATE, TEMPLATE_IDS } from '../src/assemble.js';
import type { HeaderChange } from 'orz-markdown/carrier';
import { TEMPLATES, templateList } from '../src/doc/templates.js';
import { resolveSettings } from '../src/doc/settings.js';
import { renderDocument } from '../src/render-paged.js';
import { STARTERS } from '../src/starters.js';
import { THEMES } from '../src/themes.js';
import { TEMPLATE_TEXTS } from './helpers.js';

const UID = 'doc-newdocument0001';

describe('templates are text skeletons', () => {
  it('[N.5] each of the 12 templates is a text in assets/templates with a format-1 header: kind document, title, template; src/starters.ts holds them exactly', () => {
    expect(templateList()).toHaveLength(12);
    expect(TEMPLATE_IDS).toEqual(Object.keys(TEMPLATES));
    for (const t of templateList()) {
      const text = TEMPLATE_TEXTS[t.skeleton]!;
      expect(text, t.id).toBeDefined();
      expect(text.startsWith('{{nyml\nkind: document\ntitle: '), t.id).toBe(true);
      const h = readHeader(text)!;
      expect(h.legacy, t.id).toBeNull();
      expect(h.fields['template'], t.id).toBe(t.id);
      expect(h.fields['title']?.trim(), t.id).not.toBe('');
      expect(lintHeader(text, 'paged'), t.id).toEqual([]);
      expect(STARTERS[t.skeleton] === text, t.id).toBe(true);
    }
    expect(Object.keys(STARTERS).sort()).toEqual(Object.keys(TEMPLATE_TEXTS).sort());
    // the generated module is what the sync script writes
    const before = readFileSync('src/starters.ts', 'utf8');
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/sync-templates.ts']);
    expect(readFileSync('src/starters.ts', 'utf8')).toBe(before);
  });
});

describe('newDocument', () => {
  it('[N.1] per template: carrier and uid lead the header, then the template\'s lines; lint clean; readDocument agrees; it renders with the template\'s layout', () => {
    for (const id of TEMPLATE_IDS) {
      const text = newDocument({ template: id, uid: UID });
      const skeleton = STARTERS[TEMPLATES[id].skeleton]!;
      expect(text, id).toBe(`{{nyml\nkind: document\ncarrier: paged\nuid: ${UID}\n${skeleton.slice('{{nyml\nkind: document\n'.length)}`);
      expect(lintHeader(text, 'paged'), id).toEqual([]);
      expect(lintHeader(text), id).toEqual([]);
      const doc = readDocument(text);
      expect(doc.kind, id).toBe('paged');
      expect(doc.header!.keys.slice(0, 4), id).toEqual(['carrier', 'uid', 'title', 'template']);
      expect(doc.meta.uid, id).toBe(UID);
      expect(doc.title, id).toBe(readHeader(skeleton)!.fields['title']);
      expect(doc.settings['template'], id).toBe(id);
      expect(resolveSettings(text).template, id).toBe(id);
      expect(renderDocument(text).settings, id).toEqual(renderDocument(skeleton).settings);
    }
    // the default template, title and theme
    const text = newDocument({ title: 'Lab Safety — Week 3', theme: 'light-neat-2', uid: UID });
    expect(text.startsWith(`{{nyml\nkind: document\ncarrier: paged\nuid: ${UID}\ntitle: Lab Safety — Week 3\ntemplate: ${DEFAULT_TEMPLATE}\ntheme: light-neat-2\n}}\n\n`)).toBe(true);
    expect(readDocument(text)).toMatchObject({ title: 'Lab Safety — Week 3', theme: 'light-neat-2' });
    expect(lintHeader(text, 'paged')).toEqual([]);
    for (const t of THEMES) expect(lintHeader(newDocument({ theme: t, uid: UID }), 'paged')).toEqual([]);
    // legacy template names resolve to their -section variant
    expect(readHeader(newDocument({ template: 'exam', uid: UID }))!.fields['template']).toBe('exam-section');
  });

  it('[N.2] a fresh uid per call without an injected one; pure with one', () => {
    const uids = new Set(Array.from({ length: 20 }, () => readHeader(newDocument({ title: 'x' }))!.fields['uid']));
    expect(uids.size).toBe(20);
    for (const u of uids) expect(u).toMatch(UID_PATTERN);
    expect(newDocument({ template: 'letter', title: 'x', uid: UID })).toBe(newDocument({ template: 'letter', title: 'x', uid: UID }));
  });

  it('[N.3] a letter starts on the given date (D-97): `date` replaces the starters\' sample date line (letter, cover-letter), nothing else; other templates ignore it; one line only', () => {
    expect(letterDate(new Date(2026, 9, 22))).toBe('October 22, 2026');
    expect(letterDate(new Date(2027, 0, 1))).toBe('January 1, 2027');
    for (const template of ['letter', 'cover-letter']) {
      const plain = newDocument({ template, uid: 'doc-letterdate0001' });
      expect(plain.split('\n')).toContain(STARTER_DATE);
      const dated = newDocument({ template, uid: 'doc-letterdate0001', date: 'October 22, 2026' });
      expect(dated).toBe(plain.replace(`\n${STARTER_DATE}\n`, '\nOctober 22, 2026\n'));
      expect(dated).not.toContain(STARTER_DATE);
    }
    expect(newDocument({ template: 'note', uid: 'doc-letterdate0001', date: 'x' })).toBe(newDocument({ template: 'note', uid: 'doc-letterdate0001' }));
    expect(() => newDocument({ template: 'letter', date: 'a\nb' })).toThrow(/one non-empty line/);
    // the CLI and the editor's New document from template… pass today's date
    expect(readFileSync('src/cli.ts', 'utf8')).toMatch(/date: letterDate\(new Date\(\)\)/);
    expect(readFileSync('src/browser/paged/actions.ts', 'utf8')).toMatch(/date: letterDate\(new Date\(\)\)/);
  });

  it('[N.3] refusals: unknown template or theme, malformed uid, a value the header cannot hold', () => {
    expect(() => newDocument({ template: 'brochure', uid: UID })).toThrow(/unknown template/);
    expect(() => newDocument({ theme: 'dark-elegant-1', uid: UID })).toThrow(/unknown theme/);
    expect(() => newDocument({ uid: 'doc-SHORT' })).toThrow(/malformed uid/);
    expect(() => newDocument({ uid: 'abc-0123456789' })).toThrow(/malformed uid/);
    expect(() => newDocument({ title: 'two\nlines', uid: UID })).toThrow();
    expect(() => newDocument({ title: 'a }} b', uid: UID })).toThrow();
  });

  it('[N.4] a new document assembles and extracts exactly; the file derives from its header', () => {
    for (const id of TEMPLATE_IDS) {
      const text = newDocument({ template: id, title: 'Quoted "title" & <tags>', uid: UID });
      const html = assemble(text, { delivery: 'cdn' });
      expect(extract(html)!.text, id).toBe(text);
      expect(html).toContain('<title>Quoted "title" &amp; &lt;tags&gt;</title>');
      expect(html).toContain(`"uid": "${UID}"`);
      expect(html).toContain('data-orz-kind="paged"');
    }
  });
});

describe('newDocument --title', () => {
  it('[N.6] the title also replaces the template\'s placeholder title where the skeleton repeats it: the first title element (or first `# ` heading) and the running header/footer keys that carry it; elsewhere nothing else changes', () => {
    const T = 'Thermodynamics — Final';
    const expected: Record<string, { body: RegExp | null; running?: Record<string, string> }> = {
      'article-page': { body: /kind: article-title\ntitle: Thermodynamics — Final\n/ },
      'article-section': { body: /kind: article-title\ntitle: Thermodynamics — Final\n/ },
      'report-page': { body: /kind: report-title\ntitle: Thermodynamics — Final\n/, running: { header_center: T } },
      'report-section': { body: /kind: report-title\ntitle: Thermodynamics — Final\n/, running: { header_center: T } },
      'exam-page': { body: /kind: exam-title\ntitle: Thermodynamics — Final\n/ },
      'exam-section': { body: /kind: exam-title\ntitle: Thermodynamics — Final\n/ },
      note: { body: /\n# Thermodynamics — Final\n/ },
      letter: { body: null },
      'cover-letter': { body: null },
      cv: { body: null },
      'cv-modern': { body: null },
      'cv-elegant': { body: null },
    };
    for (const id of TEMPLATE_IDS) {
      const skeleton = STARTERS[TEMPLATES[id].skeleton]!;
      const placeholder = readHeader(skeleton)!.fields['title']!;
      const text = newDocument({ template: id, title: T, uid: UID });
      const h = readHeader(text)!;
      expect(h.fields['title'], id).toBe(T);
      const e = expected[id]!;
      if (e.body) expect(text, id).toMatch(e.body);
      for (const [k, v] of Object.entries(e.running ?? {})) expect(h.fields[k], `${id} ${k}`).toBe(v);
      // the placeholder is gone from the header and the first title; the rest of the body is the skeleton's
      if (e.body) {
        const body = (s: string) => s.slice(s.indexOf('\n}}\n') + 4);
        const want = body(skeleton).replace(new RegExp(`(kind: (?:article|report|exam)-title\\ntitle: |\\n# )${placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`), `$1${T}\n`);
        expect(body(text), id).toBe(want);
        expect(Object.values(h.fields).some((v) => v.includes(placeholder)), id).toBe(false);
      }
      expect(lintHeader(text, 'paged'), id).toEqual([]);
      if (e.body) expect(renderDocument(text).bodyHtml, id).toContain('Thermodynamics — Final');
    }
    // a blank title changes nothing; the skeleton is used as is
    expect(newDocument({ template: 'note', title: '  ', uid: UID })).toBe(newDocument({ template: 'note', uid: UID }));
  });
});

describe('newDocument --title: any title round-trips', () => {
  const TITLES = ['"quoted"', 'Q: what?', '| draft', '|', '#hash', 'trailing #', '>folded', "Owner's 'guide'", '"a" b "c"', 'a -- b --- c', 'wait...', '(c) 2026 (tm)',
    'H~2~O x^2^', '==mark== ++ins++', '$x$ and $$y$$', '<b>bold</b>', '<!-- c -->', '&amp; & co', '*em* _u_ `code`', '[link](x) ![i](y)', ':smile: :+1:', 'a\\b', 'x {y} z',
    '1. not a list', '- dash', '100%', '  spaced  ', 'π ≈ 3.14 — ok'];
  /** The text of the document's first title (a title element's h1, else the first h1), entities decoded. */
  const shownTitle = (text: string): string | null => {
    const html = renderDocument(text).bodyHtml;
    const m = /<h1 class="orz-title">([\s\S]*?)<\/h1>/.exec(html) ?? /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
    return m ? m[1]!.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : null;
  };

  it('[N.7] the header title is written by the kit\'s header writer and the body\'s title as literal Markdown: readDocument(text).title is the title, and the rendered title reads exactly it (quotes, `Q:`, `|`, `#`, markup, typographic sequences, emoji codes, HTML) — in a title element and in a `# ` heading; a title with `}}` (which no header can hold) is refused', () => {
    for (const title of TITLES) {
      for (const template of ['exam-page', 'report-page', 'article-section', 'note']) {
        const text = newDocument({ template, title, uid: UID });
        const at = `${template} ${JSON.stringify(title)}`;
        expect(readDocument(text).title, at).toBe(title.trim());
        expect(readHeader(text)!.fields['title'], at).toBe(title);
        expect(shownTitle(text), at).toBe(title.trim());
        expect(lintHeader(text, 'paged'), at).toEqual([]);
      }
    }
    // plain words stay as they are (nothing to escape)
    expect(markdownLiteral('Thermodynamics — Final, part 2: notes')).toBe('Thermodynamics — Final, part 2: notes');
    expect(() => newDocument({ template: 'note', title: 'a {{x}} b', uid: UID })).toThrow(/"\}\}"/);
  });

  it('[N.8] only the template\'s placeholder title is replaced, never another first title: a first `# ` heading or title element that reads otherwise is left (and nothing after it is touched); a heading-like line inside a fenced code block before the title is skipped', () => {
    const head = '{{nyml\nkind: document\ntitle: Placeholder\nheader_center: Placeholder\n}}\n';
    const run = (body: string): { text: string; changes: Record<string, HeaderChange> } => {
      const changes: Record<string, HeaderChange> = {};
      return { text: replacePlaceholderTitle(head + body, 'New', changes), changes };
    };
    // N2: the first heading is not the placeholder → unchanged (a later placeholder heading too)
    const h = run('\n# Something else\n\n# Placeholder\n');
    expect(h.text).toBe(head + '\n# Something else\n\n# Placeholder\n');
    expect(h.changes).toEqual({ header_center: 'New' });
    // N3: the first title element's title is not the placeholder → unchanged
    const e = run('\n{{nyml\nkind: exam-title\ntitle: Another exam\n}}\n\n# Placeholder\n');
    expect(e.text).toBe(head + '\n{{nyml\nkind: exam-title\ntitle: Another exam\n}}\n\n# Placeholder\n');
    // the placeholder is replaced where it is the first title
    expect(run('\n{{nyml\nkind: report-title\ntitle: Placeholder\n}}\n').text).toBe(head + '\n{{nyml\nkind: report-title\ntitle: New\n}}\n');
    expect(run('\n# Placeholder\n\n# Placeholder\n').text).toBe(head + '\n# New\n\n# Placeholder\n');
    // N4: a fenced block before the title holds heading-like lines: they are code, not the title
    for (const fence of ['```', '~~~']) {
      expect(run(`\n${fence}md\n# Placeholder\n# Other\n${fence}\n\n# Placeholder\n`).text, fence).toBe(head + `\n${fence}md\n# Placeholder\n# Other\n${fence}\n\n# New\n`);
    }
    expect(run('\n```\n# Other\n```\n\n# Placeholder\n').text).toBe(head + '\n```\n# Other\n```\n\n# New\n');
  });
});
