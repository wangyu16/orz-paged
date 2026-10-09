/**
 * KIND-SPECIFIC (paged): the "Version" picker (REBUILD §3b guide 6 — one
 * source printed as different versions): the dynamic choices a document
 * offers, read from the text, and the header edit that picks one.
 *
 * A document offers a choice key when its content carries
 * `data-show-when="key=value"` / `data-hide-when="key=value"` (elements such
 * as the exam's answer key do) or its header's `dynamic_choices` names it.
 * The values offered are those the content and the header use; "(not set)"
 * removes the key (content shown only for a value goes, content hidden only
 * for a value stays). Picking writes the header's `dynamic_choices` map (a
 * `|` block; the key keeps its spelling there) — document data, one undoable
 * header edit.
 */
import { readHeader, type HeaderChange } from 'orz-markdown/carrier';
import { normalizeChoiceKey } from '../../doc/dynamic.js';
import { resolveSettings } from '../../doc/settings.js';
import { renderDocument } from '../../render-paged.js';

export interface VersionChoice {
  /** The normalized key (`answer_key`). */
  key: string;
  /** How the picker names it (`answer key`). */
  label: string;
  /** The values the content and the header use, sorted. */
  values: string[];
  /** The header's value, or null when the header does not set the key. */
  current: string | null;
}

let cache: { text: string; choices: VersionChoice[] } | null = null;

/** The dynamic choices a text offers (cached for the last text). */
export function versionChoices(text: string): VersionChoice[] {
  if (cache && cache.text === text) return cache.choices;
  const values = new Map<string, Set<string>>();
  const add = (k: string, v: string): void => {
    const key = normalizeChoiceKey(k);
    if (!key) return;
    let s = values.get(key);
    if (!s) values.set(key, (s = new Set()));
    if (v !== '') s.add(v);
  };
  let html = '';
  // only a text that can offer versions is rendered (the editor asks after each pause in typing)
  if (/data-(?:show|hide)-when|kind:\s*question-/.test(text)) {
    try {
      html = renderDocument(text).bodyHtml;
    } catch {
      /* a text the renderer refuses offers nothing */
    }
  }
  for (const m of html.matchAll(/data-(?:show|hide)-when="([^"]*)"/g)) {
    const raw = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const eq = raw.indexOf('=');
    add(eq < 0 ? raw : raw.slice(0, eq), eq < 0 ? '' : raw.slice(eq + 1).trim());
  }
  const header = resolveSettings(text).dynamicChoices;
  for (const [k, v] of Object.entries(header)) add(k, v);
  const choices = [...values.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, set]) => ({ key, label: key.replace(/_/g, ' '), values: [...set].sort(), current: Object.prototype.hasOwnProperty.call(header, key) ? header[key] : null }));
  cache = { text, choices };
  return choices;
}

/**
 * The header change that sets choice `key` to `value` (null: removes it) in
 * the text's `dynamic_choices` map, keeping the other lines and the key's
 * spelling; null when the map ends up empty (the header key goes).
 */
export function versionChange(text: string, key: string, value: string | null): Record<string, HeaderChange> {
  const want = normalizeChoiceKey(key);
  const raw = readHeader(text)?.fields['dynamic_choices'] ?? '';
  const lines = raw.split(/\r\n?|\n/).filter((l) => l.trim() !== '');
  let found = false;
  const out: string[] = [];
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i > 0 && normalizeChoiceKey(line.slice(0, i)) === want) {
      found = true;
      if (value !== null) out.push(`${line.slice(0, i).trim()}: ${value}`);
    } else out.push(line.trim());
  }
  if (!found && value !== null) out.push(`${want.replace(/_/g, '-')}: ${value}`);
  return { dynamic_choices: out.length > 0 ? { multiline: out.join('\n') } : null };
}
