/**
 * The Version setting's cost and its includes (claims K.6, K.7): `hidden`
 * is a cheap header/text test that never renders (it runs after each pause
 * in typing); the full render belongs to `choicesFor` (each opening), and a
 * render the read view or the editor already made of the same text (its
 * includes resolved) is read instead of rendering again. Versioned content
 * that arrives only through an include still offers Version.
 */
import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { renderDocumentAsync } from '../src/render-paged.js';
import { VERSION_SETTING } from '../src/browser/paged/settings.js';
import { choiceAttributes, mayOfferVersions, rememberRendered, versionChange, versionChoices, versionsHidden } from '../src/browser/paged/versions.js';
import { hiddenFor } from 'orz-markdown/carrier/app';
import { TEMPLATE_TEXTS } from './helpers.js';

/** A long exam (24 pages' worth of questions). */
const bigExam = (): string => {
  const head = TEMPLATE_TEXTS['exam-section']!;
  const q = (n: number) => `{{nyml\nkind: question-open\nn: ${n}\npts: 5 pts\nbody: Explain the result of experiment ${n} in two or three sentences, naming the variable that changed.\nspace: 3cm\nanswer: A model answer for question ${n}.\n}}\n\n${'Context paragraph for the question, with enough words to fill a line or two of the page. '.repeat(4)}\n`;
  return head + '\n' + Array.from({ length: 120 }, (_, i) => q(i + 10)).join('\n');
};

describe('the Version setting', () => {
  it('[K.6] hidden(text) is cheap — a header/text test, no render — and right: shown for dynamic_choices, data-*-when, exam questions and include directives; hidden for plain text; on a long exam it takes well under a millisecond while choicesFor renders', () => {
    expect(VERSION_SETTING.hidden!('{{nyml\nkind: document\n}}\n\n# Plain\n\ntext\n')).toBe(true);
    expect(VERSION_SETTING.hidden!('{{nyml\nkind: document\ndynamic_choices: |\n  v: a\n}}\n\nx\n')).toBe(false);
    expect(VERSION_SETTING.hidden!('# T\n\n<div data-show-when="v=a">A</div>\n')).toBe(false);
    expect(VERSION_SETTING.hidden!(TEMPLATE_TEXTS['exam-section']!)).toBe(false);
    expect(VERSION_SETTING.hidden!('# T\n\n{{md parts/q.md}}\n')).toBe(false);
    expect(mayOfferVersions('# T\n\n{{markdown https://example.org/q.md}}\n')).toBe(true);
    expect(mayOfferVersions('# T\n\n{{md-include q.md}}\n')).toBe(true);
    const big = bigExam();
    expect(big.length).toBeGreaterThan(40_000);
    // hidden: many calls, each a regex over the text
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) VERSION_SETTING.hidden!(big + ' '.repeat(i));
    const perHidden = (performance.now() - t0) / 50;
    // choicesFor renders the whole document (once per opening)
    const t1 = performance.now();
    const choices = VERSION_SETTING.choicesFor!(big + '\n');
    const perChoices = performance.now() - t1;
    expect(choices.map((c) => c.label)).toEqual(['answer key: hide', 'answer key: show', 'answer key: default']);
    // eslint-disable-next-line no-console
    console.log(`[K.6] hidden ${perHidden.toFixed(3)} ms, choicesFor ${perChoices.toFixed(1)} ms on a ${big.length}-character exam`);
    expect(perHidden).toBeLessThan(2);
    expect(perHidden * 10).toBeLessThan(perChoices);
  });

  it('[K.7] versioned content through an include (no dynamic_choices in the header) offers Version: the render the read view or the editor made (its includes resolved) supplies the choices; once such a render found none, Version hides', async () => {
    const text = '{{nyml\nkind: document\ntitle: With an include\n}}\n\n# Quiz\n\n{{md parts/answers.md}}\n';
    const includes = { 'parts/answers.md': '<div data-show-when="answer-key=show">The answers.</div>\n' };
    // before any render: offered (the include may carry versions), and nothing to choose yet
    expect(versionsHidden(text)).toBe(false);
    // what renderPaged does after each render (the read view, the editor preview)
    const a = await renderDocumentAsync(text, { includes });
    expect(a.bodyHtml).toContain('data-show-when="answer-key=show"');
    rememberRendered(text, a.bodyHtml);
    expect(versionsHidden(text)).toBe(false);
    expect(versionChoices(text).map((c) => [c.key, c.values, c.current])).toEqual([['answer_key', ['show'], null]]);
    expect(VERSION_SETTING.choicesFor!(text).map((c) => c.label)).toEqual(['answer key: show', 'answer key: default']);
    // an include without versions: Version hides once rendered
    const plain = text.replace('With an include', 'Plain include');
    rememberRendered(plain, (await renderDocumentAsync(plain, { includes: { 'parts/answers.md': 'No versions here.\n' } })).bodyHtml);
    expect(versionsHidden(plain)).toBe(true);
    // the header's own choices keep it shown
    const withHeader = plain.replace('title: Plain include\n', 'title: Plain include\ndynamic_choices: |\n  answer-key: show\n');
    rememberRendered(withHeader, '<p>No versions here.</p>');
    expect(versionsHidden(withHeader)).toBe(false);
  });
});

describe('the Version setting after a render', () => {
  it('[K.8] the kit\'s per-text memo of hidden(text) follows the renders: the same text, hidden after a render found no versions, is offered on the next ask once a render (the include changed) finds some — and choicesFor lists them; a render that finds the same as before keeps the memo', async () => {
    const text = '{{nyml\nkind: document\ntitle: Include that changes\n}}\n\n# Quiz\n\n{{md parts/changing.md}}\n';
    rememberRendered(text, (await renderDocumentAsync(text, { includes: { 'parts/changing.md': 'No versions yet.\n' } })).bodyHtml);
    // the kit's own memo (orz-markdown carrier/app hiddenFor: per setting, per hidden function, per text)
    expect(hiddenFor(VERSION_SETTING, text)).toBe(true);
    expect(versionChoices(text)).toEqual([]);
    const before = VERSION_SETTING.hidden;
    // the include now carries versioned content; the read view renders the same text again
    rememberRendered(text, (await renderDocumentAsync(text, { includes: { 'parts/changing.md': '<div data-show-when="answer-key=show">The answers.</div>\n' } })).bodyHtml);
    expect(hiddenFor(VERSION_SETTING, text)).toBe(false);
    expect(VERSION_SETTING.choicesFor!(text).map((c) => c.label)).toEqual(['answer key: show', 'answer key: default']);
    expect(VERSION_SETTING.hidden).not.toBe(before);
    // the same render again: nothing changed, the function (and so the kit's memo) is kept
    const now = VERSION_SETTING.hidden;
    rememberRendered(text, '<div data-show-when="answer-key=show">The answers.</div>');
    expect(VERSION_SETTING.hidden).toBe(now);
    // and back: versions gone from the include → hidden again
    rememberRendered(text, '<p>No versions.</p>');
    expect(hiddenFor(VERSION_SETTING, text)).toBe(true);
  });

  it('[K.9] a version edit keeps the key as the header spells it (case, dashes) and the other lines; a new key is added in dashed form; "default" removes it, and the map goes when empty', () => {
    const text = '{{nyml\nkind: document\ndynamic_choices: |\n  Answer-Key: hide\n  audience: student\n}}\n\nx\n';
    expect(versionChange(text, 'answer_key', 'show')).toEqual({ dynamic_choices: { multiline: 'Answer-Key: show\naudience: student' } });
    expect(versionChange(text, 'Audience', 'teacher')).toEqual({ dynamic_choices: { multiline: 'Answer-Key: hide\naudience: teacher' } });
    expect(versionChange(text, 'version', 'B')).toEqual({ dynamic_choices: { multiline: 'Answer-Key: hide\naudience: student\nversion: B' } });
    expect(versionChange(text, 'answer_key', null)).toEqual({ dynamic_choices: { multiline: 'audience: student' } });
    expect(versionChange('{{nyml\nkind: document\ndynamic_choices: |\n  Version: A\n}}\n', 'version', null)).toEqual({ dynamic_choices: null });
  });

  it('[K.9] choice values come through decoded: `&` and `"` in a data-show-when value are the characters, not their entities', () => {
    expect(choiceAttributes('<div data-show-when="audience=R&amp;D">x</div><p data-hide-when="say=&quot;hi&quot;">y</p>')).toEqual([['audience', 'R&D'], ['say', '"hi"']]);
    const text = '{{nyml\nkind: document\n}}\n\n<div data-show-when="team=R&amp;D">x</div>\n';
    expect(versionChoices(text).map((c) => [c.key, c.values])).toEqual([['team', ['R&D']]]);
  });

  it('[K.6] an exam question alone (no dynamic_choices, no data-*-when, no include) may offer versions: its answer reveal is versioned', () => {
    const q = '{{nyml\nkind: document\ntitle: One question\n}}\n\n{{nyml\nkind: question-open\nn: 1\nbody: Why?\nanswer: Because.\n}}\n';
    expect(mayOfferVersions(q)).toBe(true);
    expect(versionsHidden(q)).toBe(false);
    expect(VERSION_SETTING.choicesFor!(q).map((c) => c.label)).toEqual(['answer key: show', 'answer key: default']);
  });
});
