/**
 * The isomorphic assembler of orz-paged (FC-18 text format 1, kind `paged`).
 *
 * One module for every caller — the Node library, the CLI, the browser bundle
 * (FC-19 §2 `assemble` / `extract` / `readDocument`), "New document from
 * template…", "Save as new copy", the quiet update and the starters — so Node
 * and the browser write the same bytes (FC-18 law 2). Mirrors orz-mdhtml's
 * src/assemble.ts.
 *
 * The envelope (doctype, `<html lang data-orz-kind>`, generator, `<title>`,
 * head metadata, `#orz-meta`, `#orz-shell`, the agent banner, the `#orz-src`
 * island and `#orz-includes`) is the kit's `assembleEnvelope`; this module adds
 * only the shell parts of the 1.0 shell.
 *
 * Rules: no Node built-ins, no clock, no randomness (except `newDocument`'s
 * `mintUid`, a creation tool, FC-18 §10), no environment reads. The shell
 * version is the generated constant in ./version.ts; the template skeletons
 * are the generated ./starters.ts (from assets/templates).
 */
import {
  assembleEnvelope,
  editHeader,
  kindFromFilename,
  lintHeader,
  mintUid,
  readDocument as readKitDocument,
  readHeader,
  storedText as kitStoredText,
  UID_PATTERN,
  type DocumentInfo,
  type HeaderChange,
  type Kind,
  type ShellParts,
} from 'orz-markdown/carrier';
import { bundleUrl, isScriptSafe } from 'orz-markdown/carrier/shell';
import { pagedValueLint } from './doc/lint.js';
import { canonicalTemplate, TEMPLATES } from './doc/templates.js';
import { presentationOf, readViewMarkup, shellHead, type Presentation } from './presentation.js';
import { STARTERS } from './starters.js';
import { isThemeId, THEMES } from './themes.js';
import { VERSION } from './version.js';
import type { TemplateName } from './types.js';

export { extract } from 'orz-markdown/carrier';
export type { Extracted, DocumentInfo, Kind } from 'orz-markdown/carrier';

/** The browser bundle's file name inside `orz-paged-browser` (its `release.json` `bundle.path`). */
export const BUNDLE_FILE = 'orz-paged.browser.js';

/** The text formats this shell reads and writes (FC-18 §8.4). */
export const FORMATS: readonly number[] = Object.freeze([1]);

/** The jsDelivr URL of the browser bundle of a release (the same URL the quiet update derives, spec/shell-runtime.md §6). */
export function cdnBundleUrl(version: string = VERSION): string {
  return bundleUrl({ kind: 'paged', version, bundle: { path: BUNDLE_FILE, integrity: '' } });
}

const KINDS: readonly string[] = ['md', 'slides', 'paged'];

/**
 * Read a document's facts from its text (FC-19 §2 `readDocument`): the kit's
 * `readDocument`, with this carrier's default kind. The kind is `opts.kind`,
 * else the file name's (FC-18 §3), else the header's `carrier`, else `paged`
 * (the kit's own default is `md`). The title follows FC-18 §8.1 for `paged`:
 * the header `title`, else the first top-level level-1 heading, else the
 * `title` (else `text`) of the first `*-title` element, else `Untitled`.
 * For kind `paged` the lint checks the header's `theme` against this
 * carrier's print themes (`unknown-theme`, a warning) and its enumerated
 * values (`invalid-value`, a warning: src/doc/lint.ts).
 */
export function readDocument(text: string, opts: { kind?: Kind; filename?: string } = {}): DocumentInfo {
  const carrier = readHeader(text)?.fields['carrier']?.trim();
  const kind: Kind =
    opts.kind ??
    (opts.filename !== undefined ? kindFromFilename(opts.filename) : null) ??
    (carrier !== undefined && KINDS.includes(carrier) ? (carrier as Kind) : 'paged');
  // a paged header names a paged theme (its own list): any other is the kit's `unknown-theme` warning
  if (kind !== 'paged') return readKitDocument(text, { kind });
  const info = readKitDocument(text, { kind, themes: THEMES });
  // and its enumerated values are ones the renderer knows (`invalid-value`, S.6)
  const extra = pagedValueLint(text);
  return extra.length === 0 ? info : { ...info, lint: [...info.lint, ...extra] };
}

/** Options of {@link assemble} (FC-18 §8.2, FC-19 §2). */
export interface AssembleOptions {
  /** `inline` (default, FD-02) inlines the engine; `cdn` loads it from jsDelivr. */
  delivery?: 'inline' | 'cdn';
  /**
   * The exact text of the browser bundle, inlined for `delivery: 'inline'`
   * (required there: this module reads no files; the Node library and the
   * browser bundle supply it). Must be script-safe (no `<script`, `</script`
   * or CR — the bundle rule, spec/shell-runtime.md §6).
   */
  engineSource?: string;
  /** Resolved includes, stored in `#orz-includes` exactly as given (FC-18 §8.3, D4). */
  includes?: Record<string, string>;
}

export { PAGES_ID } from './presentation.js';

/** The id of the chrome's mount point (the kit's app renders its shadow root there). */
export const CHROME_MOUNT_ID = 'orz-chrome';

/**
 * Assemble the `.paged.html` file of a text (FC-18 §8): the kit's envelope
 * with kind `paged`, shell version {@link VERSION}, and the 1.0 shell parts —
 * in `<head>` the viewport, colour scheme and the stylesheets the header asks
 * for (KaTeX, highlight.js, the webfonts of its theme and font presets;
 * non-blocking, `media="not all"` until the read view switches them on); in
 * `<body>` the read view (`#orz-view` / `#orz-pages`, holding a quiet
 * fallback line until the engine lays out the pages), the chrome mount point
 * (`#orz-chrome`) and the engine (`#orz-engine`, inline or from jsDelivr).
 *
 * Deterministic: the same text, options and version give the same bytes.
 * Throws for a text the envelope refuses (NUL, a lone surrogate, a header
 * `format` above 1), an unknown delivery, a missing or script-unsafe
 * `engineSource` for inline delivery.
 */
export function assemble(text: string, options: AssembleOptions = {}): string {
  return assembleEnvelope(text, shellParts(options, presentationOf(text)));
}

/**
 * The shell parts {@link assemble} hands to the kit's `assembleEnvelope`: kind
 * `paged`, shell version {@link VERSION}, delivery, head and body parts, and
 * the includes. They depend on the options and on the presentation (the
 * header's theme, font presets and page size, resolved by `presentationOf`)
 * only — never on other document data (FC-18 §8.1: presentation is applied by
 * the shell parts, not the envelope). Throws as {@link assemble} does for the
 * options.
 */
export function shellParts(options: AssembleOptions = {}, presentation: Presentation = presentationOf('')): ShellParts {
  const delivery = options.delivery ?? 'inline';
  let engine: string;
  if (delivery === 'inline') {
    const src = options.engineSource;
    if (typeof src !== 'string' || src === '') throw new Error('orz-paged: inline delivery needs the engine source (options.engineSource)');
    if (!isScriptSafe(src)) throw new Error('orz-paged: the engine source is not script-safe (it holds <script, </script or a CR)');
    engine = `<script id="orz-engine">${src}</script>`;
  } else if (delivery === 'cdn') {
    engine = `<script id="orz-engine" src="${cdnBundleUrl()}"></script>`;
  } else {
    throw new Error(`orz-paged: unknown delivery ${JSON.stringify(String(delivery))}`);
  }
  const includes = options.includes && Object.keys(options.includes).length > 0 ? options.includes : undefined;
  return {
    kind: 'paged',
    shellVersion: VERSION,
    delivery,
    headHtml: shellHead(presentation, { deferred: true }),
    bodyHtml: `${readViewMarkup(presentation, delivery)}\n<div id="${CHROME_MOUNT_ID}"></div>\n${engine}`,
    ...(includes ? { includes } : {}),
  };
}

/**
 * The text a file assembled from `text` holds: `extract(assemble(text)).text`
 * — `text` itself, except that mixed line endings are stored as one style
 * (FC-18 §8.2, the first line break's). Compare a file's text with this, not
 * with the raw input. A text the envelope refuses is returned as it is.
 */
export function storedText(text: string): string {
  return kitStoredText(text, 'paged');
}

/* ─────────────────────────── newDocument ─────────────────────────── */

/** The running header and footer keys a template may fill with its placeholder title (report-page's `header_center`). */
const RUNNING_KEYS = ['header_left', 'header_center', 'header_right', 'footer_left', 'footer_center', 'footer_right'] as const;

/**
 * `newDocument`'s `title` beyond the header's `title` (N.6): the template's
 * placeholder title (its header `title`) is also replaced where the skeleton
 * repeats it — in the running header/footer keys that carry it (added to
 * `changes`) and in the body's FIRST title: the first title element's
 * `title:` line (`article-title`, `report-title`, `exam-title`) or the first
 * `# ` heading, whichever comes first, when it reads the placeholder exactly.
 */
function replacePlaceholderTitle(text: string, title: string, changes: Record<string, HeaderChange>): string {
  const header = readHeader(text);
  const placeholder = header?.fields['title']?.trim();
  if (!header || !placeholder) return text;
  for (const k of RUNNING_KEYS) {
    const v = header.fields[k];
    if (typeof v === 'string' && v.includes(placeholder)) changes[k] = v.split(placeholder).join(title);
  }
  const lines = text.split('\n');
  let i = 0;
  // past the header block
  while (i < lines.length && lines[i] !== '}}') i++;
  let inBlock: string | null = null; // the kind of the nyml block the line is in
  let fence = false;
  for (i++; i < lines.length; i++) {
    const line = lines[i];
    if (/^(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    if (line === '{{nyml') { inBlock = ''; continue; }
    if (inBlock !== null) {
      if (line === '}}') { inBlock = null; continue; }
      const k = /^kind:\s*(.+?)\s*$/.exec(line);
      if (k) { inBlock = k[1]; continue; }
      if (/^(article|report|exam)-title$/.test(inBlock) && /^title:\s*/.test(line)) {
        if (line.replace(/^title:\s*/, '').trim() !== placeholder) return text;
        lines[i] = `title: ${title}`;
        return lines.join('\n');
      }
      continue;
    }
    const h = /^#\s+(.*?)\s*$/.exec(line);
    if (h) {
      if (h[1] !== placeholder) return text;
      lines[i] = `# ${title}`;
      return lines.join('\n');
    }
  }
  return text;
}

/** The template a new document starts from when none is named. */
export const DEFAULT_TEMPLATE: TemplateName = 'note';

/** The template ids `newDocument` accepts (legacy `article` / `report` / `exam` resolve to their `-section` variant). */
export const TEMPLATE_IDS: readonly TemplateName[] = Object.freeze(Object.keys(TEMPLATES) as TemplateName[]);

/** The header opening every template skeleton starts with (tests/new-document.test.ts checks it). */
const SKELETON_OPENING = '{{nyml\nkind: document\n';

/** Options of {@link newDocument}: header values of the new text (FC-18 §5.1). */
export interface NewDocumentOptions {
  /** A template id of {@link TEMPLATE_IDS} (default {@link DEFAULT_TEMPLATE}); its skeleton is the new text. */
  template?: string;
  /** The header `title` (replaces the template's placeholder title). */
  title?: string;
  /** A paged theme id (src/themes.ts). */
  theme?: string;
  /** The document id; minted with the kit's `mintUid` when absent (tests inject one). */
  uid?: string;
}

/**
 * A new format-1 `paged` text (FC-18 §3, §7.3, §10): the template's skeleton
 * (assets/templates, a text — header + starter body) with `carrier: paged` and
 * the `uid` right after `kind: document`, then the template's own header lines
 * (`title`, `template`, its settings), then the given `title` / `theme` set in
 * place (FC-18 §9). Pure apart from `mintUid` when no `uid` is given.
 *
 * Throws for an unknown template or theme, a malformed uid, a value the
 * header cannot hold (line break, `}}`, NUL), or a value lint reports as an
 * error.
 */
export function newDocument(options: NewDocumentOptions = {}): string {
  const { title, theme } = options;
  const name = options.template ?? DEFAULT_TEMPLATE;
  const id = canonicalTemplate(name);
  if (!id) throw new Error(`orz-paged: unknown template ${JSON.stringify(name)} (${TEMPLATE_IDS.join(', ')})`);
  if (theme !== undefined && !isThemeId(theme)) throw new Error(`orz-paged: unknown theme ${JSON.stringify(theme)}`);
  const uid = options.uid ?? mintUid();
  if (!UID_PATTERN.test(uid)) throw new Error(`orz-paged: malformed uid ${JSON.stringify(uid)} (doc- and 10 to 32 of [0-9a-z])`);
  const skeleton = STARTERS[TEMPLATES[id].skeleton];
  if (skeleton === undefined || !skeleton.startsWith(SKELETON_OPENING)) throw new Error(`orz-paged: the ${id} template skeleton does not start with a format-1 header`);
  let text = `${SKELETON_OPENING}carrier: paged\nuid: ${uid}\n${skeleton.slice(SKELETON_OPENING.length)}`;
  const changes: Record<string, HeaderChange> = {};
  if (title !== undefined && title.trim() !== '') {
    changes['title'] = title;
    if (!/[\r\n\u0000]/.test(title) && !title.includes('}}')) text = replacePlaceholderTitle(text, title, changes);
  }
  if (theme !== undefined) changes['theme'] = theme;
  text = editHeader(text, changes);
  const errors = lintHeader(text, { kind: 'paged', themes: THEMES }).filter((l) => l.level === 'error');
  if (errors.length > 0) throw new Error(`orz-paged: the new header is not valid: ${errors.map((l) => `${l.code} (${l.message})`).join('; ')}`);
  return text;
}
