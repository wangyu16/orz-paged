import { describe, it, expect } from 'vitest';
import {
  applyDynamicChoices,
  collectDynamicChoices,
  normalizeChoiceKey,
} from '../src/doc/dynamic.js';

/* Minimal fake DOM — applyDynamicChoices only uses querySelectorAll (by a single
   attribute), getAttribute, removeAttribute, remove. */
function makeEl(attrs: Record<string, string>) {
  const a: Record<string, string> = { ...attrs };
  let removed = false;
  return {
    get removed() { return removed; },
    get attrs() { return a; },
    getAttribute: (n: string) => (n in a ? a[n] : null),
    removeAttribute: (n: string) => { delete a[n]; },
    remove: () => { removed = true; },
  };
}
function makeRoot(els: ReturnType<typeof makeEl>[]) {
  return {
    querySelectorAll: (sel: string) => {
      const attr = sel.replace(/[[\]]/g, '');
      return els.filter((e) => !e.removed && attr in e.attrs);
    },
  };
}

describe('normalizeChoiceKey', () => {
  it('lowercases and turns hyphens into underscores', () => {
    expect(normalizeChoiceKey('Answer-Key')).toBe('answer_key');
  });
});

describe('applyDynamicChoices', () => {
  it('show-when: keeps + strips when matched, removes otherwise', () => {
    const keep = makeEl({ 'data-show-when': 'answer-key=show' });
    const drop = makeEl({ 'data-show-when': 'answer-key=show' });
    const root = makeRoot([keep, drop]);
    // only "keep" — pretend "drop" is in a second root call; simpler: two roots
    applyDynamicChoices(makeRoot([keep]), { answer_key: 'show' });
    applyDynamicChoices(makeRoot([drop]), { answer_key: 'hide' });
    expect(keep.removed).toBe(false);
    expect(keep.getAttribute('data-show-when')).toBeNull(); // stripped
    expect(drop.removed).toBe(true);
    void root;
  });

  it('hide-when: removes when matched, keeps + strips otherwise', () => {
    const drop = makeEl({ 'data-hide-when': 'draft=true' });
    const keep = makeEl({ 'data-hide-when': 'draft=true' });
    applyDynamicChoices(makeRoot([drop]), { draft: 'true' });
    applyDynamicChoices(makeRoot([keep]), { draft: 'false' });
    expect(drop.removed).toBe(true);
    expect(keep.removed).toBe(false);
    expect(keep.getAttribute('data-hide-when')).toBeNull();
  });

  it('show-when with an unset key removes the element (default-hidden)', () => {
    const el = makeEl({ 'data-show-when': 'answer-key=show' });
    applyDynamicChoices(makeRoot([el]), {});
    expect(el.removed).toBe(true);
  });
});

describe('collectDynamicChoices', () => {
  it('returns each key with the sorted set of values it is used with', () => {
    const root = makeRoot([
      makeEl({ 'data-show-when': 'answer-key=show' }),
      makeEl({ 'data-hide-when': 'audience=student' }),
      makeEl({ 'data-show-when': 'audience=teacher' }),
    ]);
    expect(collectDynamicChoices(root)).toEqual({
      answer_key: ['show'],
      audience: ['student', 'teacher'],
    });
  });
});
