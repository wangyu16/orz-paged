/**
 * orz-paged — the Node library (the package's main export).
 *
 * Text format 1 (FC-18, kind `paged`): a document is its text twin
 * (`x.paged.md`); its self-editing, print-ready file (`x.paged.html`) is
 * `assemble(text)`. Everything here is the isomorphic code of
 * src/assemble.ts, src/inspect.ts and src/legacy.ts — the same functions the
 * browser bundle runs — except that an inline assembly needs no engine from
 * the caller: it carries this release's browser bundle (src/engine.ts: the
 * copy staged in `dist/` by the build, verified against its `release.json`),
 * so Node writes the bytes the browser writes. Mirrors orz-mdhtml 1.0's
 * src/lib.ts.
 *
 * 1.0.0 replaces the 0.x API (`buildPagedHtml`, `composeInlineHtml`,
 * `loadThemes`, `loadTemplates`, `pickDefaultTheme`, `findAsset`,
 * `stripBaseImport`, `selfVersion`, `CDN`): content (title, theme, template,
 * page settings, metadata) now comes only from the text's header, and a new
 * text comes from `newDocument({ template })`.
 */
import { ORZ_MARKDOWN_VERSION } from './version.js';
import { assemble as assembleText, type AssembleOptions } from './assemble.js';
import { upgrade as upgradeFile, type UpgradeOptions, type UpgradeResult } from './legacy.js';
import { inspect as inspectInput, type InspectOptions, type InspectReport } from './inspect.js';
import { templateList } from './doc/templates.js';
import { engineSource } from './engine.js';

export { extract, readDocument, newDocument, letterDate, storedText, cdnBundleUrl, BUNDLE_FILE, FORMATS, DEFAULT_TEMPLATE, TEMPLATE_IDS, type AssembleOptions, type NewDocumentOptions, type Extracted, type DocumentInfo, type Kind } from './assemble.js';
export type { InspectOptions, InspectReport } from './inspect.js';
export { readLegacy, type LegacyFile, type UpgradeResult, type UpgradeOptions } from './legacy.js';
export { readSettings, resolveSettings, DEFAULTS as SETTING_DEFAULTS } from './doc/settings.js';
export { THEMES, THEME_INFO, DEFAULT_THEME, isThemeId, type PagedTheme } from './themes.js';
export { VERSION } from './version.js';
export { sha256 } from 'orz-markdown/carrier';
export { engineSource, engineFiles, type EngineFiles } from './engine.js';
export type { DocSettings, TemplateName, ThemeName } from './types.js';

/**
 * The orz-markdown version this release's engine embeds (fixed at build time):
 * the parser, themes, KaTeX and CodeMirror pins of every file it writes — not
 * the kit an installation happens to resolve under the `^` range (D-69).
 */
export { ORZ_MARKDOWN_VERSION };

/** One document template (`newDocument({ template })`; `orz-paged templates`). */
export interface TemplateInfo {
  /** The id `newDocument` and the header's `template` key take. */
  id: string;
  /** The picker's name, e.g. "Article — title page". */
  label: string;
  /** One line. */
  description: string;
  /** The picker's group, e.g. "Article". */
  group: string;
}

/** The document templates, in the picker's order (the 12 of `TEMPLATE_IDS`). */
export const TEMPLATES: readonly TemplateInfo[] = Object.freeze(templateList().map((t) => Object.freeze({ id: t.id, label: t.label, description: t.description, group: t.group })));

/** The engine of an inline assembly: the caller's, else this release's bundle. */
const withEngine = <T extends AssembleOptions>(o: T): T =>
  (o.delivery ?? 'inline') === 'inline' && o.engineSource === undefined ? { ...o, engineSource: engineSource() } : o;

/**
 * Assemble the `.paged.html` file of a text (FC-18 §8, FC-19 §2): `inline`
 * (default) carries this release's browser bundle, `cdn` loads it from
 * jsDelivr. `includes` are stored in `#orz-includes` as given. Equal to the
 * browser bundle's `OrzCarrier.assemble` for the same text and options.
 *
 * Throws for a text the envelope refuses (NUL, a lone surrogate, a header
 * `format` above 1), an unknown delivery, and when the engine is missing or
 * not this release's (src/engine.ts).
 */
export function assemble(text: string, options: AssembleOptions = {}): string {
  return assembleText(text, withEngine(options));
}

/**
 * Upgrade an orz-paged file to text format 1 with this shell: a legacy 0.x
 * file becomes a format-1 text (its source, the settings block and a
 * `kind: meta` block moved to the top as one header with `carrier: paged`
 * and a uid, the 0.x `#orz-meta` and title moved in) and that text's file; a
 * format-1 file is re-assembled with its text and includes unchanged. Inline
 * by default (this release's bundle), like {@link assemble}.
 */
export function upgrade(html: string, options: UpgradeOptions = {}): UpgradeResult {
  return upgradeFile(html, withEngine(options));
}

/**
 * Inspect a text or a file of any version (the isomorphic `inspect`): an
 * inline file of this shell version is checked against this release's
 * engine (`checks.engine`), unless `options.engineSource` says otherwise;
 * when the engine cannot be read here, the check says `unverified`.
 */
export function inspect(input: string, options: InspectOptions = {}): InspectReport {
  if (options.engineSource !== undefined) return inspectInput(input, options);
  let engine: string | undefined;
  try { engine = engineSource(); } catch { engine = undefined; }
  return inspectInput(input, { ...options, ...(engine !== undefined ? { engineSource: engine } : {}) });
}
