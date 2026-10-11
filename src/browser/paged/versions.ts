/**
 * KIND-SPECIFIC (paged): the "Version" picker (REBUILD §3b guide 6 — one
 * source printed as different versions): the dynamic choices a document
 * offers, read from the text, and the header edit that picks one.
 *
 * A document offers a choice key when its content carries
 * `data-show-when="key=value"` / `data-hide-when="key=value"` (elements such
 * as the exam's answer key do) or its header's `dynamic_choices` names it.
 * The values offered are those the content and the header use; "default"
 * (round 4: "(not set)" read oddly) removes the key — the document as
 * written, no choice made (content shown only for a value goes, content
 * hidden only for a value stays). Picking writes the header's `dynamic_choices` map (a
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

/** `data-show-when` / `data-hide-when` attribute values of rendered HTML, as `[key, value]` pairs. */
export function choiceAttributes(html: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const m of html.matchAll(/data-(?:show|hide)-when="([^"]*)"/g)) {
    const raw = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const eq = raw.indexOf('=');
    out.push([eq < 0 ? raw : raw.slice(0, eq), eq < 0 ? '' : raw.slice(eq + 1).trim()]);
  }
  return out;
}

/**
 * What the last renders of a text found (the read view's and the editor
 * preview's renderer, src/browser/paged/render.ts, after includes were
 * resolved): text → its rendered body's choice attributes. A few recent texts
 * only (the read view's and the editor's).
 */
const rendered = new Map<string, Array<[string, string]>>();
const RENDERED_KEEP = 4;

/**
 * Bumped whenever a render changes what a text offers (closed loop round 2,
 * F12): the same text can offer other versions after a render (an include's
 * content changed), so what was answered for the text before is stale — the
 * {@link versionChoices} cache and the kit's `hidden` memo (which keeps the
 * last answer per setting, function and text: see {@link versionsHiddenAsker}).
 */
let generation = 0;

/** Record the choice attributes of a text's rendered body (with its includes): read by {@link versionChoices} instead of rendering again. */
export function rememberRendered(text: string, bodyHtml: string): void {
  const pairs = choiceAttributes(bodyHtml);
  const before = rendered.get(text);
  rendered.delete(text);
  rendered.set(text, pairs);
  while (rendered.size > RENDERED_KEEP) rendered.delete(rendered.keys().next().value as string);
  if (before === undefined || JSON.stringify(before) !== JSON.stringify(pairs)) {
    generation++;
    cache = null;
  }
}

let asker: { generation: number; fn: (text: string) => boolean } | null = null;

/**
 * The Version setting's `hidden` function — a new function after each render
 * that changed what a text offers. The kit asks `hidden(text)` once per text
 * and keeps the answer per setting while its `hidden` function is the same
 * (orz-markdown carrier/app `hiddenFor`); a fresh function makes it ask
 * again, so a render that found versions (or found none) is seen for the
 * same text.
 */
export function versionsHiddenAsker(): (text: string) => boolean {
  if (!asker || asker.generation !== generation) asker = { generation, fn: (text: string) => versionsHidden(text) };
  return asker.fn;
}

/**
 * Whether a text MAY offer versions, without rendering (cheap: run by the
 * kit's `hidden(text)` after each pause in typing): its header names
 * `dynamic_choices`, or its body carries `data-show-when` / `data-hide-when`,
 * an exam question (whose answer reveal is versioned), or an include
 * directive (`{{md …}}`, `{{markdown …}}`, `{{md-include …}}`: versioned
 * content may arrive through it).
 */
export function mayOfferVersions(text: string): boolean {
  return /dynamic_choices|data-(?:show|hide)-when|kind:\s*question-|\{\{\s*(?:markdown|md|md-include)\s+\S/.test(text);
}

/**
 * Whether the Version setting is hidden for a text — cheap (K.6): hidden when
 * the text cannot offer versions ({@link mayOfferVersions}), or when a render
 * of exactly this text (includes resolved) found none and the header sets
 * none. Never renders.
 */
export function versionsHidden(text: string): boolean {
  if (!mayOfferVersions(text)) return true;
  const seen = rendered.get(text);
  if (seen === undefined) return false;
  return seen.length === 0 && !(readHeader(text)?.fields['dynamic_choices'] ?? '').trim();
}

/** The dynamic choices a text offers (cached for the last text). Renders the text only when no render of it was recorded. */
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
  let pairs = rendered.get(text);
  if (pairs === undefined) {
    pairs = [];
    // only a text that can offer versions is rendered (choicesFor: at each opening of the picker)
    if (/data-(?:show|hide)-when|kind:\s*question-/.test(text)) {
      try {
        pairs = choiceAttributes(renderDocument(text).bodyHtml);
      } catch {
        /* a text the renderer refuses offers nothing */
      }
    }
  }
  for (const [k, v] of pairs) add(k, v);
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
