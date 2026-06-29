/**
 * Dynamic switch — conditional content driven by the `dynamic_choices` document
 * setting. Elements carry `data-show-when="key=value"` / `data-hide-when="key=value"`;
 * at render time non-matching ones are removed and the attribute is stripped from
 * those that stay. One source can then print several versions (e.g. an exam with
 * `answer-key: hide` for students and `show` for the instructor key).
 *
 * Operates on a live DOM (browser render) so nested removals are correct.
 */

/** Normalize a choice key: lowercase, hyphens → underscores (matches settings). */
export function normalizeChoiceKey(key: string): string {
  return key.trim().toLowerCase().replace(/-/g, '_');
}

function parseCond(raw: string): { key: string; value: string } {
  const eq = raw.indexOf('=');
  if (eq < 0) return { key: normalizeChoiceKey(raw), value: '' };
  return { key: normalizeChoiceKey(raw.slice(0, eq)), value: raw.slice(eq + 1).trim() };
}

interface CondEl {
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  remove(): void;
}
interface CondRoot {
  querySelectorAll(sel: string): ArrayLike<CondEl>;
}

/**
 * Resolve every `data-show-when` / `data-hide-when` under `root` against
 * `choices`, mutating the DOM in place: drop non-matching elements, strip the
 * attribute from the rest.
 */
export function applyDynamicChoices(root: CondRoot, choices: Record<string, string>): void {
  Array.prototype.forEach.call(root.querySelectorAll('[data-show-when]'), (el: CondEl) => {
    const { key, value } = parseCond(el.getAttribute('data-show-when') || '');
    if (choices[key] === value) el.removeAttribute('data-show-when');
    else el.remove();
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-hide-when]'), (el: CondEl) => {
    const { key, value } = parseCond(el.getAttribute('data-hide-when') || '');
    if (choices[key] === value) el.remove();
    else el.removeAttribute('data-hide-when');
  });
}

/**
 * Collect the dynamic keys present under `root` and the set of values each is
 * used with — for building a live switcher UI. Returns key → sorted values.
 */
export function collectDynamicChoices(root: CondRoot): Record<string, string[]> {
  const sets: Record<string, Set<string>> = {};
  for (const attr of ['data-show-when', 'data-hide-when']) {
    Array.prototype.forEach.call(root.querySelectorAll('[' + attr + ']'), (el: CondEl) => {
      const { key, value } = parseCond(el.getAttribute(attr) || '');
      (sets[key] = sets[key] || new Set()).add(value);
    });
  }
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(sets)) out[k] = Array.from(sets[k]).sort();
  return out;
}
