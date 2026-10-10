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
import { PREVIEW_ACK_MS, PREVIEW_DEBOUNCE_MS } from '../paged/constants.js';
import { pagedFrameDocument, pagedPreviewPresentation } from './paged/preview.js';
import { renderPaged, renderPagedPreview } from './paged/render.js';
import { encodePreviewHtml } from '../paged/input.js';
import { PAGED_RUNTIME } from './runtime-source.js';
import { PAGED_SETTINGS } from './paged/settings.js';

export const kind = 'paged' as const;

/** The preview payload of a text that changed while it rendered: no runtime input, so the frame paginates nothing. */
const STALE_PREVIEW = '<!-- orz-paged: superseded -->';
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
  /**
   * With `document: true`, a CSP nonce stamped on the `<style>` the engine
   * writes (the print theme, the page and element CSS) — a `srcdoc` frame
   * inherits the app's policy, so under a nonce `style-src` the stylesheet
   * was refused (closed loop round 3). The engine adds no script; the
   * document's own raw HTML is never stamped (its scripts stay refused by
   * such a policy).
   */
  nonce?: string;
  /**
   * With `document: true`: a print document — the paged runtime (nonce-
   * stamped with `nonce`) lays the content out as the read view's Paged.js
   * pages and resolves `window.__orzPrintReady` when they are final: what
   * the kit's `printDocument(html, { nonce })` prints from an app's page
   * (the editor's `print` event; closed loop round 3). It carries the
   * runtime (about 350 KB) and no theme `<style>` of its own.
   */
  pages?: boolean;
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
  if (options.document && options.pages) return printPagesDocument(text, input, options.nonce);
  const body = withChoices(input.bodyHtml, input.dynamicChoices);
  if (!options.document) return body;
  const info = readDocument(text);
  const links = [PREVIEW_CDN.katexCss, PREVIEW_CDN.hljsLightCss, ...input.links].map((u) => `<link rel="stylesheet" href="${escapeAttr(u)}">`).join('\n');
  const css = input.sheets.map((s) => s.css).join('\n').replace(/<\/(style)/gi, '<\\/$1');
  const nonce = typeof options.nonce === 'string' && options.nonce !== '' ? ` nonce="${escapeAttr(options.nonce)}"` : '';
  return `<!doctype html>\n<html lang="${escapeAttr(info.lang)}">\n<head>\n<meta charset="utf-8">\n<meta name="color-scheme" content="light">\n<title>${escapeHtml(info.title)}</title>\n${links}\n<style${nonce}>${css}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

/** The bootstrap of a print document (ES5, script-safe): lay the payload out, resolve `__orzPrintReady` when final. */
const PRINT_BOOT = '(function(){var W=window,D=document,R=W.__orzPaged,t=D.getElementById("orz-print-input"),p=D.getElementById("orz-pages");W.__orzPrintReady=R&&t&&p?R.layOutPayload(t.innerHTML,p):Promise.resolve();})();';

/** A print document of a rendered text: the runtime and the payload; the pages are laid out where it is opened. */
function printPagesDocument(text: string, input: Awaited<ReturnType<typeof renderPaged>>, nonce?: string): string {
  const info = readDocument(text);
  const n = typeof nonce === 'string' && nonce !== '' ? ` nonce="${escapeAttr(nonce)}"` : '';
  // the payload in a template (inert: no script of it runs, nothing is fetched until the runtime lays it out); `</template` cannot end it early
  const payload = encodePreviewHtml(input).replace(/<\/(template)/gi, '<\\/$1');
  return `<!doctype html>\n<html lang="${escapeAttr(info.lang)}">\n<head>\n<meta charset="utf-8">\n<meta name="color-scheme" content="light">\n<title>${escapeHtml(info.title)}</title>\n<script${n}>${PAGED_RUNTIME}</script>\n<style${n}>html,body{margin:0;padding:0;background:#fff}</style>\n</head>\n<body>\n<div id="orz-pages" class="orz-pages"></div>\n<template id="orz-print-input">${payload}</template>\n<script${n}>${PRINT_BOOT}</script>\n</body>\n</html>\n`;
}

/** The kit's print of a whole document from an app's page (orz-markdown `carrier/editor`, FC-19 §8.5): pass `renderPreview(text, { document: true, pages: true, nonce })`. */
export { printDocument } from 'orz-markdown/carrier/editor';

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

  // eslint-disable-next-line prefer-const
  let shell: EditorShell;
  const shellText = (): string | null => { try { return shell ? shell.getText() : null; } catch { return null; } };
  shell = createEditorShell(element as never, {
    text: options.text,
    render: async (text, rc) => {
      const html = await renderPagedPreview(text, {
        ...(rc.includes ? { includes: rc.includes } : {}),
        ...(rc.fetchInclude ? { fetchInclude: rc.fetchInclude } : {}),
        ...(rc.twinLinks === false ? { twinLinks: false } : {}),
        ...(rc.cache ? { cache: rc.cache } : {}),
      });
      // a key arrived while the text rendered: no pagination of a text already gone (the frame keeps its pages and
      // the "updating…" mark; the kit renders the newer text after the next pause — closed loop round 2, E.5)
      const now = shellText();
      return now !== null && now !== text ? STALE_PREVIEW : html;
    },
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
      // a pagination runs in the frame, in the editor's process (Paged.js lays out one page per frame): it starts after
      // a short pause in typing (800 ms: past the pauses within a burst of typing; never forced while keys keep arriving: the kit's `maxWaitMs: Infinity`), from
      // the first page the edit changed (the pages before it kept, each new page swapped in as it is laid out) and is
      // acknowledged when the first new page shows (at most PREVIEW_ACK_MS), so the kit paces renders by first paint;
      // an edit abandons a running pagination at its next page — typing never freezes (E.4, E.5, E.6)
      debounceMs: PREVIEW_DEBOUNCE_MS,
      maxWaitMs: Infinity,
      // the frame acknowledges every render within PREVIEW_ACK_MS (its first layout included): the kit waits a little
      // longer for the first acknowledgement, so even the first render is paced by the frame (orz-markdown 2.3.0)
      firstAckWaitMs: PREVIEW_ACK_MS + 1000,
    },
  });

  // every edit is reported to the preview frame (the kit's preview channel): the frame marks its pages "updating…"
  // and abandons a pagination of an older text at its next page, so a layout never freezes typing after a pause
  const offEdit = shell.on('change', () => { shell.preview.post({ type: 'orz-paged-edit' }); });

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
    offEdit();
    settings.destroy();
    aiMenu?.destroy();
    destroy();
  };
  return shell;
}

/** Re-exported for apps: the header edit the pickers apply (FC-18 §9). */
export { editHeader } from 'orz-markdown/carrier';
