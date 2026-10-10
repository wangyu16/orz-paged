/**
 * The orz-paged browser API (FC-19 §2): what `globalThis.OrzCarrier` holds
 * in the IIFE bundle and what the ESM build exports — `kind`, `version`,
 * `formats`, `assemble`, `extract`, `readDocument`, `mountEditor`,
 * `renderPreview`.
 *
 * KIND-SPECIFIC (paged): `mountEditor` wraps the kit's `createEditorShell`
 * (orz-markdown `carrier/editor`, FC-19 §8) with a Paged.js preview in the
 * sandboxed frame (FC-19 §8.4 pluggable preview: src/browser/paged/preview.ts),
 * the header's webfonts in the preview (`followPresentation`), the paged
 * settings in its toolbar (`attachSettings`) and the Version picker;
 * `assemble` is the isomorphic assembler of src/assemble.ts — the same
 * function the Node library runs, so Node and the browser write the same
 * bytes (FC-18 law 2).
 */
import { extract as kitExtract, type DocumentInfo, type Extracted, type HeaderChange } from 'orz-markdown/carrier';
import { attachAiMenu, attachSettings, captureEngineSource, followPresentation, type EngineSource, type StandaloneContext } from 'orz-markdown/carrier/app';
import { createEditorShell, type EditorHooks, type EditorShell } from 'orz-markdown/carrier/editor';
import type { PreferenceStore } from 'orz-markdown/carrier/shell';
import { escapeAttr, escapeHtml } from 'orz-markdown/carrier/read';
import { PREVIEW_CDN } from 'orz-markdown/preview-frame';
import { assemble as assembleSync, cdnBundleUrl, FORMATS, readDocument as pagedReadDocument, type AssembleOptions } from '../assemble.js';
import { applyDynamicChoices } from '../doc/dynamic.js';
import { VERSION } from '../version.js';
import { pagedFrameDocument, pagedPreviewPresentation } from './paged/preview.js';
import { renderPaged, renderPagedPreview } from './paged/render.js';
import { PAGED_SETTINGS } from './paged/settings.js';

export const kind = 'paged' as const;
export const version: string = VERSION;
export const formats: number[] = [...FORMATS];

export type { DocumentInfo, Extracted, HeaderChange, EditorHooks, PreferenceStore };

/**
 * The engine an inline assembly writes when no `engineSource` is given. The
 * IIFE entry sets the bundle's own captured script (`captureEngineSource()`,
 * synchronously at its start); the ESM build captures nothing (an app's own
 * script is not the engine), so it fetches this release's IIFE from jsDelivr.
 */
let engine: Pick<EngineSource, 'inline' | 'get'> = captureEngineSource({ currentScript: null });

/** Use a captured engine source (the IIFE entry). */
export function useEngineSource(e: Pick<EngineSource, 'inline' | 'get'>): void {
  engine = e;
}

/**
 * Assemble the `.paged.html` file of a text (FC-19 §2, FC-18 §8): the same
 * bytes as the Node library's `assemble` for the same options. `delivery`
 * defaults to `inline`; an inline file carries `engineSource` — by default
 * this bundle's own text (inline at once; fetched from its URL when loaded by
 * URL or as ESM). `includes` go into `#orz-includes` as given. Rejects what
 * the Node `assemble` throws for.
 */
export function assemble(text: string, options: AssembleOptions = {}): Promise<string> {
  try {
    if ((options.delivery ?? 'inline') === 'inline' && options.engineSource === undefined) {
      const own = engine.inline;
      if (own === null) return engine.get(cdnBundleUrl()).then((src) => assembleSync(text, { ...options, engineSource: src }));
      return Promise.resolve(assembleSync(text, { ...options, engineSource: own }));
    }
    return Promise.resolve(assembleSync(text, options));
  } catch (e) {
    return Promise.reject(e);
  }
}

/** The text of an assembled file (the kit's `extract`), or null for HTML that is not one. */
export function extract(html: string): Extracted | null {
  return kitExtract(html);
}

/** The header and derived facts of a paged text, without rendering (the kit's `readDocument`, kind `paged`, linted against the print themes and the paged keys' values — the Node library's `readDocument`). */
export function readDocument(text: string): DocumentInfo {
  return pagedReadDocument(text, { kind: 'paged' });
}

/** Options of {@link renderPreview}. */
export interface RenderPreviewOptions {
  /** An include `includes` lacks → text or null (the app's trust policy): a URL, or a file include's path as written. */
  fetchInclude?(target: string): Promise<string | null>;
  /** Resolved includes (`extract(html).includes`): target as written → text. */
  includes?: Readonly<Record<string, string>>;
  /** `false`: links as written; default `true` (links to text twins point at their `.html` form). */
  twinLinks?: boolean;
  /**
   * `true`: a whole HTML document (the print theme, the page and element CSS,
   * KaTeX's and highlight.js' stylesheets, the webfonts) for a sandboxed
   * iframe's `srcdoc` — the engine adds no script and does not paginate (a
   * continuous view of the content); the document's own raw HTML is kept as
   * written (scripts included): show it only in a sandboxed frame. Default
   * `false`: the content's HTML (`<main class="orz-doc markdown-body">`).
   */
  document?: boolean;
}

/** The body HTML with the header's dynamic choices applied (needs a DOM; as written without one). */
function withChoices(bodyHtml: string, choices: Record<string, string>): string {
  if (typeof document === 'undefined') return bodyHtml;
  const t = document.createElement('template');
  t.innerHTML = bodyHtml;
  applyDynamicChoices(t.content, choices);
  return t.innerHTML;
}

/**
 * Read-only HTML of a text for an app (thumbnails, read views): the content's
 * HTML with the header's version choices applied (or, with `document: true`,
 * a whole HTML document with the stylesheets and no engine script). Not
 * paginated: the pages need the engine (the read view, the editor preview).
 * Either way the document's own raw HTML is kept as written — scripts
 * included (orz-markdown M.21: documents come from trusted sources): show it
 * in a sandboxed frame.
 */
export async function renderPreview(text: string, options: RenderPreviewOptions = {}): Promise<string> {
  const input = await renderPaged(text, {
    ...(options.fetchInclude ? { fetchInclude: options.fetchInclude } : {}),
    ...(options.includes ? { includes: options.includes } : {}),
    ...(options.twinLinks === false ? { twinLinks: false } : {}),
  });
  const body = withChoices(input.bodyHtml, input.dynamicChoices);
  if (!options.document) return body;
  const info = readDocument(text);
  const links = [PREVIEW_CDN.katexCss, PREVIEW_CDN.hljsLightCss, ...input.links].map((u) => `<link rel="stylesheet" href="${escapeAttr(u)}">`).join('\n');
  const css = input.sheets.map((s) => s.css).join('\n').replace(/<\/(style)/gi, '<\\/$1');
  return `<!doctype html>\n<html lang="${escapeAttr(info.lang)}">\n<head>\n<meta charset="utf-8">\n<meta name="color-scheme" content="light">\n<title>${escapeHtml(info.title)}</title>\n${links}\n<style>${css}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

// ── mountEditor ─────────────────────────────────────────────────────────────

/** FC-19 §3 `EditorOptions` (the kit's `KindEditorOptions`, kind `paged`). */
export interface EditorOptions {
  /** The document (FC-18), exact. */
  text: string;
  /** Always `paged` for this carrier (accepted for FC-19 compatibility). */
  kind?: 'paged';
  readOnly?: boolean;
  mode?: 'split' | 'editor' | 'preview';
  /** `full` (labels), `compact` (icons), `none` (no toolbar: the app drives the API). */
  chrome?: 'full' | 'compact' | 'none';
  hooks?: EditorHooks;
  /** Reader preferences (FC-18 §6); default: localStorage, namespaced by the header uid. */
  preferences?: PreferenceStore;
  /**
   * FC-19 §3 `nonce` (FC-19 §8.4 CSP recipe): a CSP nonce stamped on the
   * preview frame's scripts and styles (the paged runtime, Paged.js' inserted
   * styles come from a stamped script) and on CodeMirror's script and style
   * elements. Needed under a nonce-based `script-src`.
   */
  nonce?: string;
  /** FC-19 §3 `includes`: resolved includes the app hands the renderer (target as written → text). */
  includes?: Record<string, string>;
  /** FC-19 §3 `fileName`: the suggested name of this editor's saves when it has no `hooks.save`. Default `document.paged.html`. */
  fileName?: string;
}

/** The Editor of FC-19 §4 (the kit's editor shell, which implements it). */
export type Editor = EditorShell;

/**
 * Mount the paged editor (FC-19 §3–4) in `element`: the kit's editor shell
 * with the Paged.js preview (src/browser/paged/preview.ts: the frame runs the
 * paged runtime; `diff: false`; renders acknowledged by the frame when the
 * pages are laid out), the header's webfonts in the preview (they follow
 * header edits), the paged settings (Version among them, shown while the
 * document defines choices) in its toolbar
 * (spec/carrier-app.md §3.2).
 *
 * With `hooks.save` the app owns persistence (FC-19 §8.5 app host). Without it
 * the standalone save runs: on an assembled file (`ctx`, given by the kit's
 * app) through the file's own saver, host connection, delivery and includes;
 * elsewhere an inline assembly through the File System Access picker or a
 * download.
 */
export function mountEditor(element: HTMLElement, options: EditorOptions, standalone?: StandaloneContext): Editor {
  if (!element || typeof element !== 'object') throw new TypeError('orz-paged: mountEditor needs an element');
  if (!options || typeof options.text !== 'string') throw new TypeError('orz-paged: options.text must be a string');
  const appHooks: EditorHooks = options.hooks ?? {};
  const isApp = typeof appHooks.save === 'function';
  const ctx = isApp ? undefined : standalone;

  const ai = appHooks.ai ?? ctx?.ai;
  const fetchInclude = appHooks.fetchInclude ?? ctx?.fetchInclude;
  const hooks: EditorHooks = { ...appHooks, ...(ai ? { ai } : {}), ...(fetchInclude ? { fetchInclude } : {}) };
  const preferences = options.preferences ?? ctx?.preferences;

  const shell = createEditorShell(element as never, {
    text: options.text,
    render: (text, rc) => renderPagedPreview(text, {
      ...(rc.includes ? { includes: rc.includes } : {}),
      ...(rc.fetchInclude ? { fetchInclude: rc.fetchInclude } : {}),
      ...(rc.twinLinks === false ? { twinLinks: false } : {}),
      ...(rc.cache ? { cache: rc.cache } : {}),
    }),
    kind: 'paged',
    formats: [...FORMATS],
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.readOnly ? { readOnly: true } : {}),
    ...(options.chrome ? { chrome: options.chrome } : {}),
    ...(preferences ? { preferences } : {}),
    ...(options.nonce ? { nonce: options.nonce } : {}),
    ...(ctx?.adapter ? { adapter: ctx.adapter } : {}),
    hooks,
    ...(isApp ? {
      ...(options.includes ? { includes: options.includes } : {}),
      ...(typeof options.fileName === 'string' && options.fileName !== '' ? { fileName: options.fileName } : {}),
    } : ctx ? {
      assemble: ctx.assemble,
      fileName: ctx.fileName,
      saver: ctx.saver,
      ...(ctx.host ? { host: ctx.host } : {}),
      ...(ctx.includes ? { includes: ctx.includes } : {}),
      ...(ctx.openedHtml ? { openedHtml: ctx.openedHtml } : {}),
      standalone: ctx.standalone,
    } : {
      // no hooks.save and no file: an inline file of the text (with the app's includes), through the picker or a download
      assemble: (t: string, o?: { includes?: Record<string, string> }) => assemble(t, { ...(o?.includes ? { includes: o.includes } : {}) }),
      ...(options.includes ? { includes: options.includes } : {}),
      ...(typeof options.fileName === 'string' && options.fileName !== '' ? { fileName: options.fileName } : {}),
    }),
    preview: {
      ...pagedPreviewPresentation(options.text),
      assets: false,
      diff: false,
      frameDocument: pagedFrameDocument,
      // a pagination reflows every page in the frame, in the editor's process (seconds for a long document, the
      // page blocked meanwhile): it runs only after a real pause in typing (1.5 s, grown by the kit to twice the
      // last render), never forced while keys keep arriving (the kit's `maxWaitMs: Infinity`, 2.3.0), and the next
      // waits for the frame's acknowledgement — the preview lags, typing never freezes (E.4)
      debounceMs: 1500,
      maxWaitMs: Infinity,
    },
  });

  // the carrier's tools in the toolbar (FC-19 §1: the same tools for every host)
  const iconOnly = options.chrome === 'compact';
  const settings = attachSettings(shell, PAGED_SETTINGS, { iconOnly });
  const appAi = appHooks.ai;
  const aiMenu = appAi && !ctx?.ai ? attachAiMenu(shell, { operations: () => (Array.isArray(appAi.operations) ? appAi.operations : []), iconOnly }) : null;
  // the preview follows the header's theme and fonts
  const unfollow = followPresentation(shell, pagedPreviewPresentation);

  const destroy = shell.destroy.bind(shell);
  shell.destroy = () => {
    unfollow();
    settings.destroy();
    aiMenu?.destroy();
    destroy();
  };
  return shell;
}

/** Re-exported for apps: the header edit the pickers apply (FC-18 §9). */
export { editHeader } from 'orz-markdown/carrier';
