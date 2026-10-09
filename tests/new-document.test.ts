/**
 * newDocument: the creation tool's text, from the template skeletons
 * (claims N.1–N.5).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { lintHeader, readHeader, UID_PATTERN } from 'orz-markdown/carrier';
import { newDocument, readDocument, assemble, extract, DEFAULT_TEMPLATE, TEMPLATE_IDS } from '../src/assemble.js';
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
