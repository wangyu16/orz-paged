/**
 * Legacy orz-paged 0.x files (experimental, before text format 1): reading
 * them and upgrading them to a format-1 text and file. Owner decision 7
 * (REBUILD §3b, as for orz-mdhtml): no compatibility shim — `upgrade` and
 * `inspect` are the way forward.
 *
 * A 0.x file (written by the 0.x `src/template.ts` + `assets/app.js`):
 * - the source in `<script type="text/markdown" id="orz-src">`, written as
 *   `"\n" + source + "\n"` with every `</script` (any case) as `<\/script`
 *   (nothing else escaped); the in-file save serialises the DOM and writes
 *   the same. The 0.x runtime never reversed that escape (its editor showed
 *   `<\/script`); `readLegacy` restores `</script` — the text as written in
 *   the `.md` the file was made from — and says so in a note;
 * - the generator says `orz-paged <version>` and the file has no `#orz-shell`;
 *   the config is `window.__ORZ_PAGED__ = {…}` (`version`, `mode`, themes,
 *   templates — no document id);
 * - the settings: the first `{{nyml kind: document}}` block found ANYWHERE in
 *   the source (the 0.x parser searched the raw string); a `{{nyml kind:
 *   meta}}` block (DocMeta) was consumed by the 0.x library (`buildPagedHtml`)
 *   into `#orz-meta` / `<head>`, but kept in the island by the 0.x CLI and by
 *   the editor;
 * - `<title>` is the CLI `--title` (default: the input's file name) or the
 *   library's `title` (default `Untitled`); the reader's theme choice was
 *   never saved.
 *
 * Isomorphic: no Node built-ins, no clock; randomness only through `mintUid`
 * when the file has no valid id and none is injected.
 *
 * The source island, the generator, the config, the delivery, the `<title>`
 * and `#orz-meta` are read by orz-markdown's `readLegacyIsland` (2.3.0, the
 * reader orz-mdhtml and this carrier share); this module keeps the paged
 * names, the notes' wording and the 0.x header arrangement.
 */
import { scanNymlBlocks, type NymlBlock } from 'orz-markdown';
import { editHeader, extract, mintUid, normalizeHeader, readHeader, readLegacyIsland, withoutHeader, UID_PATTERN, type HeaderChange } from 'orz-markdown/carrier';
import type { DocMeta } from 'orz-markdown/doc-meta';
import { compareSemver } from 'orz-markdown/carrier/shell';
import { assemble, readDocument, type AssembleOptions } from './assemble.js';
import { VERSION } from './version.js';

export { generatorOf } from 'orz-markdown/carrier';

/** What {@link readLegacy} reads from a 0.x file. */
export interface LegacyFile {
  /** The source: the island with `<\/script` restored to `</script`, without the writer's wrapping line breaks. */
  text: string;
  /** Whether the island had the 0.x writer's `\n…\n` wrapper (or `\r\n…\r\n`; otherwise its content is kept exactly). */
  wrapped: boolean;
  /** How many `<\/script` the island held (restored to `</script` in `text`). */
  scriptEscapes: number;
  /** The generator meta (`orz-paged 0.7.3`), if any. */
  generator: string | null;
  /** The 0.x version, from the config's `version`, else the generator. */
  version: string | null;
  /** `inline` / `cdn` from the engine script, if found. */
  delivery: 'inline' | 'cdn' | null;
  /** The `<title>` text (entities decoded), if any. */
  title: string | null;
  /** DocMeta from `#orz-meta` in the head, if any. */
  meta: DocMeta | null;
  /** Things found but not understood (reported by `inspect`, never acted on). */
  notes: string[];
}

/**
 * Read a legacy orz-paged 0.x file; `null` when `html` is not one (no
 * `#orz-src` island, a format-1 `#orz-shell`, or no 0.x marker — an
 * `orz-paged` generator or the `__ORZ_PAGED__` config).
 */
export function readLegacy(html: string): LegacyFile | null {
  const island = readLegacyIsland(html, { generator: /^orz-paged(\s|$)/, config: '__ORZ_PAGED__' });
  if (!island) return null;
  const notes: string[] = [];
  if (island.configError) notes.push('the 0.x config (window.__ORZ_PAGED__) is not readable JSON; the version was read from the generator only');
  if (island.scriptEscapes > 0) {
    notes.push(`the source held ${island.scriptEscapes} \`<\\/script\` (the 0.x writer's escape of \`</script\`, which the 0.x editor showed as written): restored to \`</script\` as in the text the file was made from`);
  }
  notes.push(...island.notes);
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  const genVersion = island.generator !== null ? (/^orz-paged\s+(\S+)/.exec(island.generator)?.[1] ?? null) : null;
  return {
    text: island.text,
    wrapped: island.wrapped,
    scriptEscapes: island.scriptEscapes,
    generator: island.generator,
    version: str(island.config['version']) ?? genVersion,
    delivery: island.delivery,
    title: island.title,
    meta: island.meta,
    notes,
  };
}

/* ─────────────────────────── the 0.x source → one header ─────────────────────────── */

/** A `{{nyml kind: document}}` opening as the 0.x parser found it: anywhere in the raw source. */
const RAW_DOCUMENT_BLOCK = /\{\{nyml[ \t]*(?:\r\n|\n|\r)[ \t]*kind[ \t]*:[ \t]*document[ \t]*(?:\r\n|\n|\r|\}\})/;

/** The line break style of a text (its first line break; LF when it has none). */
const eolOf = (s: string): string => /\r\n|\n|\r/.exec(s)?.[0] ?? '\n';

const LINE = /[^\r\n]*(?:\r\n|\n|\r|$)/g;

/** The lines of `s` from `from`, each with its offset and its text without the line break. */
function linesFrom(s: string, from: number): Array<{ at: number; text: string; next: number }> {
  const out: Array<{ at: number; text: string; next: number }> = [];
  LINE.lastIndex = from;
  while (LINE.lastIndex < s.length) {
    const at = LINE.lastIndex;
    const m = LINE.exec(s);
    if (!m || m[0] === '') break;
    out.push({ at, text: m[0].replace(/[\r\n]+$/, ''), next: at + m[0].length });
  }
  return out;
}

const lineStartOf = (s: string, at: number): number => Math.max(s.lastIndexOf('\n', at - 1), s.lastIndexOf('\r', at - 1)) + 1;

/**
 * A `}}` inside a value of the 0.x settings block (CSS such as
 * `@media print { .a { color: red; }}`) ends the block early: the 0.x parser
 * and the format-1 reader both end a block at the first `}}`. When the block
 * evidently goes on — its closing `}}` sits on an indented or non-empty line,
 * and after it only indented or blank lines (the rest of the value) follow
 * up to a lone `}}` line — that lone line is the intended end, and every `}}`
 * before it is written `} }` (in CSS the same thing; FC-18 §5: "write `} }`
 * in CSS"). When a bare `key:` line comes between (F7: it may as well be body
 * text that 0.x showed), nothing is repaired and a note says so (`note`).
 * Returns the repaired source and what changed, a note, or `null` when the
 * block ends where it ends.
 */
function repairCloser(source: string, block: NymlBlock): { source: string; count: number; keys: string[] } | { note: string } | null {
  const closeAt = block.end - 2;
  const lineAt = lineStartOf(source, closeAt);
  const before = source.slice(lineAt, closeAt);
  if (before === '') return null;
  let end = -1;
  let bareKey: string | null = null;
  for (const line of linesFrom(source, block.end).slice(1)) {
    if (line.text === '}}' || /^\}\}[ \t]*$/.test(line.text)) {
      end = line.at;
      break;
    }
    if (line.text.trim() === '' || /^[ \t]/.test(line.text)) continue;
    const k = /^([A-Za-z0-9_]+)[ \t]*[:：]/.exec(line.text);
    if (k) {
      bareKey ??= k[1]!;
      continue;
    }
    return null;
  }
  // the rest of the cut line (after its `}}`) must not be the start of a new block or of body text
  if (end < 0) return null;
  // a bare `key:` line between: the block may as well end where it ends (0.x ended it there and showed the rest)
  if (bareKey !== null) {
    const line = source.slice(0, closeAt).split(/\r\n|\n|\r/).length;
    return { note: `the settings block ends at a \`}}\` inside a value (line ${line}; 0.x ended it there too), and a lone \`}}\` follows after a \`${bareKey}:\` line: not repaired — the lines in between stay body text; if they belong to the settings, write the value's \`}}\` as \`} }\`` };
  }
  const region = source.slice(block.start + 2, end);
  const keys = new Set<string>();
  let count = 0;
  const repaired = region.replace(/\}(?=\})/g, (_m: string, at: number) => {
    count += 1;
    const abs = block.start + 2 + at;
    const lines = source.slice(block.start, abs).split(/\r\n|\n|\r/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const k = /^([A-Za-z0-9_]+)[ \t]*[:：]/.exec(lines[i]!);
      if (k) {
        keys.add(k[1]!);
        break;
      }
    }
    return '} ';
  });
  return { source: source.slice(0, block.start + 2) + repaired + source.slice(end), count, keys: [...keys] };
}

/**
 * Cut `[start, end)` out of `s`; when the cut part starts a line, its line
 * break and one following blank line go with it (so no hole is left). Returns
 * the text and the whitespace removed besides the block.
 */
function cutBlock(s: string, start: number, end: number): { text: string; extra: string } {
  let to = end;
  if (lineStartOf(s, start) === start) {
    const m = /^[ \t]*(?:\r\n|\n|\r)/.exec(s.slice(to));
    if (m) {
      to += m[0].length;
      const blank = /^[ \t]*(?:\r\n|\n|\r)/.exec(s.slice(to));
      if (blank && (start === 0 || /(?:\r\n|\n|\r)[ \t]*(?:\r\n|\n|\r)$/.test(s.slice(0, start)) || /^\uFEFF?[ \t\r\n]*$/.test(s.slice(0, start)))) to += blank[0].length;
    }
  }
  return { text: s.slice(0, start) + s.slice(to), extra: s.slice(end, to) };
}

/** The result of {@link headerFromLegacySource}. */
export interface LegacySourceResult {
  /** The text with one FC-18 header at the top (the settings block's lines, then the meta-only keys' lines). */
  text: string;
  /** What changed, in sentences (reported by `upgrade`). */
  notes: string[];
  /** Whether a block was moved to the top (`false`: the source already led with it, or had none). */
  moved: boolean;
  /** Where the source had its settings (`document`) and `kind: meta` blocks: leading the text (`header`), later (`body`), or not at all. */
  found: { document: 'header' | 'body' | 'none'; meta: 'header' | 'body' | 'none' };
  /**
   * What the one header no longer holds of the source's blocks: `key: value`
   * of `kind: meta` entries the settings block overrides (FC-18 §5; noted when
   * the values differ) and the meta block's own markers (`{{nyml`, `kind:
   * meta`, `}}`) once it is merged. Counted as kept by the upgrade's check.
   */
  dropped: string[];
}

/**
 * Turn a 0.x paged source into a text that leads with ONE FC-18 header: the
 * settings block (`{{nyml kind: document}}`, the first found anywhere — as
 * the 0.x parser took it) and the first `{{nyml kind: meta}}` block are moved
 * to the top as they are written and merged by the kit's `editHeader` (FC-18
 * §5: the settings block's lines first, then the lines of the meta-only keys;
 * the settings block wins a clash, which is noted). A `}}` inside a settings
 * value is made safe first ({@link repairCloser}). Nothing else changes; a
 * block that cannot be moved exactly (e.g. inside a blockquote) is left where
 * it is, with a note.
 */
export function headerFromLegacySource(source: string): LegacySourceResult {
  const notes: string[] = [];
  let src = source;
  let blocks = scanNymlBlocks(src);
  let doc = blocks.find((b) => b.kind === 'document');
  if (doc) {
    const fix = repairCloser(src, doc);
    if (fix && 'note' in fix) notes.push(fix.note);
    else if (fix) {
      src = fix.source;
      notes.push(`the settings block held \`}}\` inside ${fix.keys.length ? fix.keys.map((k) => `\`${k}\``).join(', ') : 'a value'} (${fix.count}×), which ended the block early (in 0.x too): written \`} }\`${fix.keys.every((k) => k === 'custom_css') ? ', the same CSS' : ' — check the value'}`);
      blocks = scanNymlBlocks(src);
      doc = blocks.find((b) => b.kind === 'document');
    }
  }
  // F6: 0.x took the first `{{nyml kind: document}}` in the RAW text — also one in a code block or an HTML comment, which format 1 does not read
  const raw = RAW_DOCUMENT_BLOCK.exec(src);
  if (raw && (!doc || raw.index < doc.start)) {
    const line = src.slice(0, raw.index).split(/\r\n|\n|\r/).length;
    notes.push(`0.x read its settings from the \`{{nyml kind: document}}\` block at line ${line}, inside a code block or an HTML comment (0.x searched the raw text); format 1 does not read it there${doc ? ` (the block at line ${src.slice(0, doc.start).split(/\r\n|\n|\r/).length} is the header now)` : ''} — copy its lines into the header if the document needs them`);
  }
  const meta = blocks.find((b) => b.kind === 'meta');
  const extraDocs = blocks.filter((b) => b.kind === 'document' && b !== doc).length;
  if (extraDocs > 0) notes.push(`${extraDocs} more \`{{nyml kind: document}}\` block(s) after the first were ignored by 0.x and stay in the body (lint: stray-document-block)`);

  // FC-18 §5: in a meta+document pair the settings block wins a clash.
  const dropped: string[] = [];
  if (doc && meta) {
    for (const [k, v] of Object.entries(meta.fields)) {
      if (k === 'kind' || !(k in doc.fields)) continue;
      dropped.push(`${k}: ${v}`);
      if (doc.fields[k] !== v) notes.push(`\`kind: meta\` ${k} ${JSON.stringify(v)} was not kept: the settings block's ${k} ${JSON.stringify(doc.fields[k])} wins`);
    }
  }

  // the meta block's own markers go when it merges into the document header
  // (or its `kind: meta` becomes `kind: document` when it is alone)
  if (meta) dropped.push(doc ? '{{nyml kind: meta }}' : 'meta');

  const header = readHeader(src);
  const inHeader = (b: NymlBlock | undefined): boolean => !!b && !!header && header.blocks.some((h) => h.start === b.start);
  const wanted = [doc, meta].filter((b): b is NymlBlock => !!b);
  const found = {
    document: !doc ? ('none' as const) : inHeader(doc) ? ('header' as const) : ('body' as const),
    meta: !meta ? ('none' as const) : inHeader(meta) ? ('header' as const) : ('body' as const),
  };
  if (wanted.every(inHeader)) return { text: src, notes, moved: false, dropped, found };

  // Cut the blocks out (last first) and put them at the top, settings block first.
  const eol = eolOf(src);
  const bom = src.startsWith('\uFEFF') ? '\uFEFF' : '';
  let rest = src;
  for (const b of [...wanted].sort((x, y) => y.start - x.start)) {
    const cut = cutBlock(rest, b.start, b.end);
    if (cut.extra.trim() !== '') throw new Error('orz-paged upgrade: internal error — a cut removed text besides the block');
    rest = cut.text;
  }
  rest = rest.startsWith(bom) ? rest.slice(bom.length) : rest;
  const prefix = wanted.map((b) => src.slice(b.start, b.end) + eol + eol).join('');
  // the kit's legacy merge (FC-18 §5): a leading meta+document pair becomes one document header
  const merged = normalizeHeader(bom + prefix + rest);
  const h = readHeader(merged);
  // verify: every key of the moved blocks reads back (the settings block wins a clash), the body is the rest
  const ok =
    !!h &&
    h.legacy === null &&
    (!doc || Object.entries(doc.fields).every(([k, v]) => k === 'kind' || h.fields[k] === v)) &&
    (!meta || Object.entries(meta.fields).every(([k, v]) => k === 'kind' || h.fields[k] === v || (!!doc && k in doc.fields))) &&
    withoutHeader(merged).body.replace(/^\s+/, '') === rest.replace(/^\s+/, '');
  if (!ok) {
    notes.push('the settings block could not be moved to the top exactly (is it inside a blockquote, list or container?): it stays where it is and does not apply in format 1 — move it to the top of the text by hand');
    return { text: src, notes, moved: false, dropped, found };
  }
  notes.push(`moved ${wanted.map((b) => `the \`kind: ${b.kind}\` block`).join(' and ')} to the top as the document's one header`);
  return { text: merged, notes, moved: true, dropped, found };
}

/* ─────────────────────────── upgrade ─────────────────────────── */

/** What {@link upgrade} returns. */
export interface UpgradeResult {
  /** The format-1 text twin. */
  text: string;
  /** Its assembly with this shell. */
  html: string;
  /** `legacy` (a 0.x file) or `format-1` (already format 1: re-assembled with this shell). */
  from: 'legacy' | 'format-1';
  /** Header keys this upgrade wrote from outside the source (`carrier`, `uid`, `#orz-meta`, `<title>`), with their values. */
  moved: Record<string, string>;
  /** What was found, changed or not moved, and why: every note, the normal conversion steps included. */
  notes: string[];
  /**
   * The notes that need a look (something not moved, not kept, or left where
   * 0.x read it); the rest of {@link notes} are the normal steps of a
   * conversion (a block moved to the top, a 0.x id replaced by a new uid, the
   * 0.x `<\/script` escape restored), which the CLI prints as notes, not
   * warnings (D-108).
   */
  warnings: string[];
}

/** The notes of a normal conversion — every 0.x file gets them — as opposed to those that need a look (D-108). */
const CONVERSION_NOTE = /^(moved the `kind: |the source held \d+ `<\\\/script`|the 0\.x document id )/;
/** The notes of an upgrade that need a look (see {@link UpgradeResult.warnings}). */
export const upgradeWarnings = (notes: readonly string[]): string[] => notes.filter((n) => !CONVERSION_NOTE.test(n));

/** Options of {@link upgrade}: the assembly's, and a uid to use instead of minting one (tests). */
export interface UpgradeOptions extends AssembleOptions {
  uid?: string;
  /**
   * Re-assemble a format-1 file whose shell is NEWER than this tool (a
   * downgrade). Default `false`: such a file is refused.
   */
  downgrade?: boolean;
}

/** A value the header can hold as a single line (FC-18 §9). */
const writable = (v: string): boolean => v.trim() !== '' && !/[\r\n\u0000]/.test(v) && !v.includes('}}');

/** Non-whitespace characters, for the "never lose text" check. */
const ink = (s: string): string => s.replace(/\s+/g, '');

/**
 * Upgrade an orz-paged file to text format 1: a legacy 0.x file becomes a
 * format-1 text — its source, with the settings block and a `kind: meta`
 * block moved to the top as one header ({@link headerFromLegacySource}), that
 * header naming `carrier: paged` and a `uid` (`#orz-meta`'s when valid, else
 * the injected or a minted one) and the DocMeta and title the 0.x library
 * kept outside the source — and that text's assembly. Keys the source's own
 * blocks set are never overwritten. A format-1 file is re-assembled with this
 * shell, keeping its includes and its twin-link naming (`#orz-shell`
 * `"links"`).
 *
 * Never loses text: the upgraded text holds every non-whitespace character of
 * the legacy source (a `}}` in a settings value becomes `} }`, noted), else it
 * throws. Throws for a file that is neither.
 */
export function upgrade(html: string, options: UpgradeOptions = {}): UpgradeResult {
  const { uid: injected, downgrade, ...assembleOptions } = options;
  const legacy = readLegacy(html);
  if (!legacy) {
    const ex = extract(html);
    if (!ex || ex.shell === '') throw new Error('orz-paged upgrade: not an orz-paged file (neither a 0.x file nor one made by orz-paged 1.0 or later)');
    if (ex.kind !== 'paged') throw new Error(`orz-paged upgrade: an orz-${ex.kind === 'md' ? 'mdhtml' : ex.kind} file; use orz-${ex.kind === 'md' ? 'mdhtml' : ex.kind}`);
    if (ex.format > 1) throw new Error(`orz-paged upgrade: written for a newer orz-paged (its header says format: ${ex.format}; this version reads format 1)`);
    if (!downgrade && compareSemver(ex.shell, VERSION) === 1) {
      throw new Error(`orz-paged upgrade: the file's shell (orz-paged ${ex.shell}) is newer than this tool (${VERSION}); upgrading would downgrade it. Use \`npx orz-paged@latest upgrade\`, or pass --force (library: { downgrade: true }) to re-assemble it with this older shell anyway`);
    }
    const includes = assembleOptions.includes ?? ex.includes;
    // the file's twin-link naming (#orz-shell "links", FC-18 §8.2) is kept, as every save keeps it
    const twinLinks = assembleOptions.twinLinks ?? ex.twinLinks;
    return { text: ex.text, html: assemble(ex.text, { ...assembleOptions, ...(includes ? { includes } : {}), ...(twinLinks ? { twinLinks } : {}) }), from: 'format-1', moved: {}, notes: [], warnings: [] };
  }

  const t = legacyText(legacy, injected);
  return { text: t.text, html: assemble(t.text, assembleOptions), from: 'legacy', moved: t.moved, notes: t.notes, warnings: t.warnings };
}

/** What {@link legacyText} returns: the format-1 text of a 0.x file, what moved into its header, and the notes. */
export interface LegacyText {
  text: string;
  moved: Record<string, string>;
  notes: string[];
  warnings: string[];
}

/**
 * The format-1 text {@link upgrade} writes for a 0.x file (read by
 * {@link readLegacy}), without assembling it: the source, its settings block
 * and `kind: meta` block moved to the top as one header naming `carrier:
 * paged` and a `uid` (`#orz-meta`'s when valid, else `uid`, else a minted
 * one), with the DocMeta and title the 0.x file kept outside the source. The
 * browser `extract` of a 0.x file returns it (D-111). Throws when the text
 * would not keep the source.
 */
export function legacyText(legacy: LegacyFile, injected?: string): LegacyText {
  const source = legacy.text;
  const arranged = headerFromLegacySource(source);
  const notes = [...legacy.notes, ...arranged.notes];
  const base = arranged.text;
  const header = readHeader(base);
  const has = (k: string): boolean => !!header && Object.prototype.hasOwnProperty.call(header.fields, k);
  const changes: Array<[string, string]> = [];
  const add = (key: string, value: string | undefined | null, what: string): void => {
    if (value === undefined || value === null || value.trim() === '' || has(key) || changes.some(([k]) => k === key)) return;
    if (!writable(value)) {
      notes.push(`${what} not moved into the header: the value cannot be a single header line`);
      return;
    }
    changes.push([key, value]);
  };

  add('carrier', 'paged', 'carrier');
  if (!has('uid')) {
    const own = legacy.meta?.uid;
    const valid = typeof own === 'string' && UID_PATTERN.test(own.trim());
    if (own && !valid) notes.push(`the 0.x document id ${JSON.stringify(own)} is not the doc-… form 1.x ids take: the document got a new id (the header's uid)`);
    add('uid', valid ? own!.trim() : (injected ?? mintUid()), 'uid');
  }
  const meta = legacy.meta ?? {};
  add('title', meta.title, '#orz-meta title');
  // The 0.x `<title>` was the CLI's --title (by default the file name) or the
  // library's title (default Untitled): it is moved only when the text derives
  // no title of its own (no header title, level-1 heading or title element).
  if (!has('title') && !meta.title && legacy.title && legacy.title !== 'Untitled') {
    const derived = readDocument(base, { kind: 'paged' }).title;
    if (derived === 'Untitled') add('title', legacy.title, '<title>');
    else if (derived !== legacy.title) notes.push(`the 0.x <title> ${JSON.stringify(legacy.title)} (the CLI --title, by default the file name) was not moved: the text's own title is ${JSON.stringify(derived)}`);
  }
  add('author', meta.author, '#orz-meta author');
  add('description', meta.description, '#orz-meta description');
  add('date', meta.date, '#orz-meta date');
  add('keywords', Array.isArray(meta.keywords) ? meta.keywords.join(', ') : undefined, '#orz-meta keywords');
  add('source', meta.source, '#orz-meta source');
  add('license', meta.license?.spdx, '#orz-meta license');
  add('license_name', meta.license?.name, '#orz-meta license name');
  add('license_url', meta.license?.url, '#orz-meta license url');

  let text = base;
  const moved: Record<string, string> = {};
  for (const [key, value] of changes) {
    try {
      text = editHeader(text, { [key]: value } satisfies Record<string, HeaderChange>);
      moved[key] = value;
    } catch (e) {
      notes.push(`${key} not moved into the header: ${(e as Error).message}`);
    }
  }

  // Never lose text: every non-whitespace character of the source is in the text
  // (a repaired `}}` is `} }`: the same characters; a `kind: meta` entry the
  // settings block overrides is counted as kept — it is noted), and the body
  // after the header is the arranged body exactly.
  assertKeepsLegacySource(source, base, text, arranged.dropped);
  return { text, moved, notes, warnings: upgradeWarnings(notes) };
}

/**
 * The upgrade's "never lose text" net (U.1, U.7): throws unless `text` (the
 * upgraded text) keeps `arranged` (the source with its blocks moved to the
 * top) as its body exactly, after its header, AND holds every non-whitespace
 * character of `source` — each as often as the source has it, counting once
 * each character of what the one header no longer holds (`dropped`: overridden
 * `kind: meta` entries, the meta block's markers). Exported for its unit test.
 */
export function assertKeepsLegacySource(source: string, arranged: string, text: string, dropped: readonly string[]): void {
  const after = withoutHeader(text).body;
  const arrangedBody = readHeader(arranged) ? withoutHeader(arranged).body : arranged.replace(/^\uFEFF/, '');
  const kept = after.endsWith(arrangedBody) && after.slice(0, after.length - arrangedBody.length).trim() === '';
  const pool = countChars(ink(text));
  for (const d of dropped) for (const c of ink(d)) pool.set(c, (pool.get(c) ?? 0) + 1);
  let all = true;
  for (const c of ink(source)) {
    const n = pool.get(c) ?? 0;
    if (n === 0) {
      all = false;
      break;
    }
    pool.set(c, n - 1);
  }
  if (!kept || !all) throw new Error('orz-paged upgrade: the upgraded text does not keep the legacy source; nothing was written');
}

function countChars(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of s) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}
