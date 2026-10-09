/**
 * `inspect`: a JSON-able diagnosis of a text or a file, for agents and tools
 * (REBUILD §3b, owner decision 7, the shape of orz-mdhtml's): what it is,
 * which format and shell, its identity, settings keys and header lint,
 * whether it is a legacy 0.x file, and what to do.
 *
 * Isomorphic and deterministic: no Node built-ins, no clock, no randomness.
 *
 * KIT GAP: the report shape, the structure checks and the twin check are
 * orz-mdhtml's (src/inspect.ts) with the kind's names; a kind-parameterised
 * `inspect` core in orz-markdown/carrier (2.3.0) would leave each carrier only
 * its legacy reader and advice wording.
 */
import { kindFromFilename, type Kind, type Lint } from 'orz-markdown/carrier';
import { compareSemver } from 'orz-markdown/carrier/shell';
import { cdnBundleUrl, extract, FORMATS, readDocument, storedText } from './assemble.js';
import { generatorOf, headerFromLegacySource, readLegacy } from './legacy.js';
import { sha256 } from './sha256.js';
import { VERSION } from './version.js';

/** The report {@link inspect} returns (plain JSON data). */
export interface InspectReport {
  /** This tool: the shell it writes and the text formats it reads and writes. */
  tool: { name: 'orz-paged'; version: string; formats: number[] };
  /**
   * `text` (a text twin or any Markdown), `assembled` (a format-1 file),
   * `legacy` (an orz-paged 0.x file), `html` (HTML that is neither).
   */
  input: 'text' | 'assembled' | 'legacy' | 'html';
  /** The document kind (`md`, `slides`, `paged`); `null` when there is no document. */
  kind: Kind | null;
  /** The text format; `null` when there is no format-1 document (legacy files are pre-format). */
  format: number | null;
  /** Whether this tool may assemble, edit and save it (kind `paged`, a format it writes). */
  writable: boolean;
  /** The assembled file's markers (`#orz-shell`, generator meta), and how its shell compares to this tool's. */
  shell: { version: string; generator: string | null; delivery: string; relation: 'same' | 'older' | 'newer' | 'unknown' } | null;
  /**
   * What a legacy 0.x file holds: its version, generator, delivery, `<title>`,
   * `#orz-meta` keys, and where its settings are — `settings`: `header` (the
   * `{{nyml kind: document}}` block already leads the text), `body` (it sits
   * later in the text: `upgrade` moves it to the top), `none`; `meta`: the
   * same for a `{{nyml kind: meta}}` block.
   */
  legacy: { version: string | null; generator: string | null; delivery: 'inline' | 'cdn' | null; title: string | null; metaKeys: string[]; settings: 'header' | 'body' | 'none'; meta: 'header' | 'body' | 'none' } | null;
  /** The header `uid` when valid (FC-18 §10). */
  uid: string | null;
  /** The derived title (FC-18 §8.1, paged: header title, heading, first `*-title` element). */
  title: string | null;
  /** The header `theme`, when set. */
  theme: string | null;
  /** The header `template`, when set. */
  template: string | null;
  /** The header: present, legacy form (`meta`, `meta+document`), keys in source order. */
  header: { present: boolean; legacy: null | 'meta' | 'meta+document'; keys: string[] } | null;
  /** The paged settings keys the header sets (FC-18 §5.1, the kit's `readDocument` `settings`). */
  settings: Record<string, string>;
  /** Number of resolved includes stored in `#orz-includes` (0 for a text). */
  includes: number;
  /**
   * The SHA-256 (hex) of the text the input holds — a text's exact UTF-8
   * bytes, the text inside an assembled or 0.x file — or null (HTML that holds
   * no orz text): the CLI's `--replaces` token.
   */
  sha256: string | null;
  /** Header lint findings of the text (FC-18 §5; the kit's `lintHeader`). */
  lint: Lint[];
  /** What to do next, in plain sentences (commands included). */
  advice: string[];
  /**
   * An assembled file's structure (FC-18 §8): whether the `#orz-src` island and
   * the document (`</html>`) are closed, and the engine — `same` (the inline
   * engine is this release's bundle, byte for byte), `different`, `unverified`
   * (another shell version, or no reference bundle given), `cdn` (loaded from
   * jsDelivr: the `src` is checked instead), `missing`. `null` otherwise.
   */
  checks: { island: 'closed' | 'unclosed'; end: 'closed' | 'unclosed'; engine: 'same' | 'different' | 'unverified' | 'cdn' | 'missing' } | null;
  /**
   * The sibling twin (FC-18 §3: `x.paged.md` ↔ `x.paged.html`), when the
   * caller passed it: `holds` `same` / `different` / `none`, which was
   * modified last, the twin's text SHA-256, and (`different` only) `earlier`
   * when the caller found the file's text to be an earlier state of the twin.
   */
  twin: { name: string; holds: 'same' | 'different' | 'none'; newer: 'input' | 'twin' | 'same-time' | 'unknown'; sha256: string | null; earlier?: 'git-head' | 'git-index' | 'git-log' | 'cache' } | null;
  /** Things found but not understood; nothing was changed because of them. */
  notes: string[];
}

/** Options of {@link inspect}. */
export interface InspectOptions {
  /** The input's file name: decides the kind of a text (FC-18 §3). */
  filename?: string;
  /** The sibling twin's content and which was modified last (the CLI reads it; this module reads no files). */
  twin?: { name: string; content: string; newer?: 'input' | 'twin' | 'same-time' | 'unknown'; earlier?: 'git-head' | 'git-index' | 'git-log' | 'cache' | null };
  /** This release's browser bundle (the Node library passes it): an inline file of this shell version is compared with it (`checks.engine`). */
  engineSource?: string;
}

/** HTML is recognised by its start: an optional BOM and whitespace, then `<!doctype html` or `<html`. */
const looksHtml = (s: string): boolean => /^\uFEFF?\s*(?:<!doctype\s+html|<html[\s>])/i.test(s.slice(0, 1024));

/** A file name as a shell word (quoted when it holds anything but safe characters). */
const sh = (name: string): string => (/^[\w./@%+=:,-]+$/.test(name) ? name : `'${name.replace(/'/g, `'\\''`)}'`);

/** `x.paged.md` → `x.browser.paged.md` (where a file's other text goes for a merge). */
export const browserName = (textName: string): string => `${textName.replace(/\.paged\.md$/i, '').replace(/\.md$/i, '')}.browser.paged.md`;

const CARRIER: Record<Kind, string> = { md: 'orz-mdhtml', slides: 'orz-slides', paged: 'orz-paged' };

/** Inspect a text or a `.paged.html` file (any version). `filename`, when given, decides the kind of a text (FC-18 §3). */
export function inspect(input: string, options: InspectOptions = {}): InspectReport {
  const report: InspectReport = {
    tool: { name: 'orz-paged', version: VERSION, formats: [...FORMATS] },
    input: 'text',
    kind: null,
    format: null,
    writable: false,
    shell: null,
    legacy: null,
    uid: null,
    title: null,
    theme: null,
    template: null,
    header: null,
    settings: {},
    includes: 0,
    sha256: null,
    lint: [],
    advice: [],
    checks: null,
    twin: null,
    notes: [],
  };
  let text: string;
  let legacyText: string | null = null;
  let kind: Kind | undefined;
  const html = looksHtml(input);
  const self = sh(options.filename ?? (html ? 'file.paged.html' : 'file.paged.md'));
  if (!html && input.trim() === '' && options.filename !== undefined && /\.html?$/i.test(options.filename)) {
    report.input = 'html';
    report.advice.push(`the file is empty (${input.length === 0 ? 'no bytes' : 'only white space'}): a damaged or unfinished file, it holds no text — recover the text from its text twin or a backup, then assemble again`);
    return report;
  }
  if (html) {
    const legacy = readLegacy(input);
    if (legacy) {
      report.input = 'legacy';
      const arranged = headerFromLegacySource(legacy.text);
      report.legacy = {
        version: legacy.version,
        generator: legacy.generator,
        delivery: legacy.delivery,
        title: legacy.title,
        metaKeys: legacy.meta ? Object.keys(legacy.meta) : [],
        settings: arranged.found.document,
        meta: arranged.found.meta,
      };
      report.notes.push(...legacy.notes, ...arranged.notes.filter((n) => !/^moved /.test(n)));
      const twinText = options.twin && !looksHtml(options.twin.content) ? options.twin : null;
      const what = 'its settings block and metadata become one FC-18 header at the top; the text is kept';
      if (twinText) {
        const other = sh(browserName(twinText.name));
        report.advice.push(
          `legacy orz-paged ${legacy.version ?? '0.x'} file (experimental, before text format 1; no compatibility shim) next to the text ${twinText.name}: run \`orz-paged upgrade ${self} --text ${other}\` — it writes this file's format-1 text (${what}) to ${browserName(twinText.name)} and re-assembles this file from it; then compare it with ${twinText.name}, merge what you keep into ${twinText.name} (keep the new header), and \`orz-paged assemble ${sh(twinText.name)}\``,
        );
      } else {
        report.advice.push(`legacy orz-paged ${legacy.version ?? '0.x'} file (experimental, before text format 1; no compatibility shim): run \`orz-paged upgrade ${self}\` for its format-1 text twin and a new file; ${what}. The file's own update banner cannot update it; \`orz-paged upgrade\` is the way`);
      }
      legacyText = legacy.text;
      text = arranged.text;
      kind = 'paged';
    } else {
      const ex = extract(input);
      if (!ex) {
        report.input = 'html';
        report.advice.push('an HTML file without an #orz-src island: not an orz document; nothing to extract');
        return report;
      }
      if (ex.shell === '') {
        report.input = 'html';
        report.notes.push('an #orz-src island without #orz-shell and without orz-paged 0.x markers: an unknown writer');
        report.advice.push('`orz-paged extract` reads the island as format 1 would; check the text before relying on it');
        return report;
      }
      report.input = 'assembled';
      const cmp = ex.kind === 'paged' ? compareSemver(ex.shell, VERSION) : null;
      const relation = cmp === -1 ? 'older' : cmp === 0 ? 'same' : cmp === 1 ? 'newer' : 'unknown';
      report.shell = { version: ex.shell, generator: generatorOf(input), delivery: ex.delivery, relation };
      report.includes = ex.includes ? Object.keys(ex.includes).length : 0;
      if (ex.kind === 'paged') report.checks = structureOf(input, ex.shell, ex.delivery, options.engineSource);
      if (report.checks) {
        const c = report.checks;
        const recovered = sh(`${(options.filename ?? 'file.paged.html').replace(/\.paged\.html$/i, '').replace(/\.html?$/i, '')}.recovered.paged.md`);
        if (c.island === 'unclosed') report.advice.push(`the #orz-src island is not closed (the file was cut off): the text may be incomplete — recover what you can: \`orz-paged extract ${self} -o ${recovered}\`, compare it with the text twin or a backup, and keep the complete text; do not re-assemble or upgrade this file from it`);
        else if (c.end === 'unclosed') report.advice.push(`the file does not end with </html> (cut off or damaged): its text is complete, but the page may not work; \`orz-paged upgrade ${self}\` re-assembles it`);
        if (c.island === 'closed' && (c.engine === 'different' || c.engine === 'missing')) report.advice.push(`the inline engine is ${c.engine === 'missing' ? 'missing' : `not orz-paged ${ex.shell}'s release bundle (altered or cut)`}: \`orz-paged upgrade ${self}\` re-assembles the file with this release's engine; the text does not change`);
        if (c.engine === 'unverified' && ex.delivery === 'inline' && relation !== 'same') report.notes.push(`the inline engine was not verified: this tool holds the bundle of ${VERSION}, the file's shell is ${ex.shell}`);
      }
      if (ex.kind === 'paged') {
        if (relation === 'older' && report.checks?.island !== 'unclosed') report.advice.push(`made by orz-paged ${ex.shell}, older than this tool (${VERSION}): \`orz-paged upgrade ${self}\` re-assembles it with the newest shell; the text does not change`);
        if (relation === 'newer') report.advice.push(`made by a newer orz-paged (${ex.shell}) than this tool (${VERSION}): re-assembling here would write an older shell; use \`npx orz-paged@latest\``);
      }
      text = ex.text;
      kind = ex.kind;
    }
  } else {
    text = input;
    kind = options.filename ? (kindFromFilename(options.filename) ?? undefined) : undefined;
  }

  // the text the input holds (a 0.x file: its source; the facts below read it with its header arranged as `upgrade` would)
  report.sha256 = sha256(legacyText ?? text);
  const doc = readDocument(text, kind ? { kind } : {});
  report.kind = doc.kind;
  report.format = report.input === 'legacy' ? null : doc.format;
  report.uid = doc.meta.uid ?? null;
  report.title = doc.title;
  report.theme = doc.theme ?? null;
  report.template = doc.header?.fields['template'] ?? null;
  report.header = doc.header ? { present: true, legacy: doc.header.legacy, keys: [...doc.header.keys] } : { present: false, legacy: null, keys: [] };
  report.settings = doc.kind === 'paged' ? { ...doc.settings } : {};
  report.lint = doc.lint;
  const newer = doc.format > Math.max(...FORMATS);
  report.writable = doc.kind === 'paged' && !newer && report.input !== 'legacy' && report.shell?.relation !== 'newer' && report.checks?.island !== 'unclosed';

  if (doc.kind !== 'paged') report.advice.push(`an orz ${doc.kind} document: use ${CARRIER[doc.kind]} (\`npx ${CARRIER[doc.kind]}\`)`);
  if (newer) report.advice.push(`text format ${doc.format} is newer than this tool reads and writes (format ${FORMATS.join(', ')}): read-only here; use a newer orz-paged (\`npx orz-paged@latest\`)`);
  const errors = doc.lint.filter((l) => l.level === 'error');
  if (errors.length > 0) report.advice.push(`fix the header lint errors in the text (${[...new Set(errors.map((l) => l.code))].join(', ')}), then assemble again`);
  if (report.input !== 'legacy' && doc.header?.legacy) report.advice.push('the header is a legacy `kind: meta` block (or a meta + settings pair): the first header edit (any tool) merges it into one `kind: document` header; nothing to do by hand');
  if (report.input !== 'legacy' && doc.lint.some((l) => l.code === 'stray-document-block')) report.advice.push('a `{{nyml kind: document}}` block that is not at the top of the text is not the settings source in format 1 (0.x read it anywhere): move its lines into the header at the top');
  if (options.twin && (report.input === 'text' || report.input === 'assembled') && doc.kind === 'paged') {
    report.twin = twinCheck(report.input, text, options.twin);
    const t = report.twin;
    const tn = sh(t.name);
    const twinLegacy = report.input === 'text' && looksHtml(options.twin.content) && readLegacy(options.twin.content) !== null;
    if (t.holds === 'different' && twinLegacy) {
      report.advice.push(`${t.name} is a legacy orz-paged 0.x file holding a different text than this text twin: \`orz-paged upgrade ${tn} --text ${sh(browserName(options.filename ?? 'file.paged.md'))}\` gives its format-1 text; compare and merge that into ${options.filename ?? 'this text'}, then \`orz-paged assemble ${self}\``);
    } else if (t.holds === 'different' && options.twin.earlier) {
      const source = { 'git-head': 'its last commit', 'git-index': 'its staged version', 'git-log': 'one of its recent commits', cache: 'what orz-paged last wrote there' }[options.twin.earlier];
      t.earlier = options.twin.earlier;
      if (report.input === 'text') report.advice.push(`${t.name} holds an earlier text of this text twin (${source}): \`orz-paged assemble ${self}\` replaces it, no --force needed`);
      else report.advice.push(`this file holds an earlier text of ${t.name} (${source}): \`orz-paged assemble ${tn}\` replaces it, no --force needed`);
    } else if (t.holds === 'different') {
      const newerNote = t.newer === 'twin' ? `, and ${t.name} was modified later` : t.newer === 'input' ? '; this file was modified later' : '';
      if (report.input === 'text') {
        report.advice.push(`${t.name} holds a different text than this text twin${newerNote}. If it has changes this text lacks (saved in the browser), bring them in first: \`orz-paged extract ${tn} -o ${sh(browserName(options.filename ?? 'file.paged.md'))}\` and merge; when this text has everything, \`orz-paged assemble ${self} --replaces ${t.sha256}\``);
      } else {
        report.advice.push(`the text twin ${t.name} holds a different text than this file${newerNote}. If this file has changes the twin lacks (saved in the browser), \`orz-paged extract ${self} -o ${sh(browserName(t.name))}\` and merge them into ${t.name}; then \`orz-paged assemble ${tn} --replaces ${report.sha256}\``);
      }
    } else if (t.holds === 'none' && report.input === 'text') {
      report.advice.push(`${t.name} exists but is not an orz file: \`orz-paged assemble\` will not replace it without --force`);
    }
  }
  if (report.input === 'text' && doc.kind === 'paged' && !newer && report.twin?.holds !== 'different') report.advice.push(`a text twin: \`orz-paged assemble ${self}\` makes its .paged.html`);
  return report;
}

/** The text a `.paged.html` holds (format 1, or a 0.x file's source), or null. */
function heldText(html: string): string | null {
  if (!looksHtml(html)) return null;
  const legacy = readLegacy(html);
  if (legacy) return legacy.text;
  const ex = extract(html);
  return ex && ex.shell !== '' ? ex.text : null;
}

function twinCheck(input: 'text' | 'assembled', text: string, twin: NonNullable<InspectOptions['twin']>): NonNullable<InspectReport['twin']> {
  const newer = twin.newer ?? 'unknown';
  if (input === 'text') {
    const held = heldText(twin.content);
    if (held === null) return { name: twin.name, holds: 'none', newer, sha256: null };
    return { name: twin.name, holds: held === storedText(text) ? 'same' : 'different', newer, sha256: sha256(held) };
  }
  if (looksHtml(twin.content) && heldText(twin.content) !== null) return { name: twin.name, holds: 'none', newer, sha256: null };
  return { name: twin.name, holds: storedText(twin.content) === text ? 'same' : 'different', newer, sha256: sha256(twin.content) };
}

/** The first `<script …>` start tag with this id, with its content's bounds (raw text: up to the first `</script`). */
function scriptElement(html: string, idValue: string): { attrs: string; start: number; end: number | null } | null {
  const open = new RegExp(`<script\\b([^>]*\\bid\\s*=\\s*["']?${idValue}["']?[^>]*)>`, 'i').exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const close = html.slice(start).search(/<\/script/i);
  return { attrs: open[1]!, start, end: close < 0 ? null : start + close };
}

/** The structural checks of an assembled paged file (see {@link InspectReport.checks}). */
function structureOf(html: string, shell: string, delivery: string, engineSource: string | undefined): NonNullable<InspectReport['checks']> {
  const island = scriptElement(html, 'orz-src');
  const end = /<\/html\s*>\s*$/i.test(html) ? 'closed' : 'unclosed';
  const engineEl = scriptElement(html, 'orz-engine');
  let engine: NonNullable<InspectReport['checks']>['engine'];
  if (!engineEl) engine = 'missing';
  else if (delivery === 'cdn' || /\bsrc\s*=/i.test(engineEl.attrs)) {
    const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(engineEl.attrs)?.[1];
    engine = src === cdnBundleUrl(shell) && engineEl.end !== null ? 'cdn' : 'different';
  } else if (engineEl.end === null) engine = 'different';
  else if (engineSource === undefined || shell !== VERSION) engine = 'unverified';
  else engine = html.slice(engineEl.start, engineEl.end) === engineSource ? 'same' : 'different';
  return { island: island && island.end !== null ? 'closed' : 'unclosed', end, engine };
}
