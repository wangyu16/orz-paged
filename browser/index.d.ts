/**
 * Types of `orz-paged-browser` (FC-19 §2–4): the IIFE's `globalThis.OrzCarrier`
 * and the ES module's named exports have this shape. Self-contained (no
 * dependency on orz-markdown's types); the full definitions live in
 * orz-markdown `carrier/editor` (FC-19 §8).
 */

export type Kind = 'md' | 'slides' | 'paged';
export type EditorMode = 'split' | 'editor' | 'preview';
export type HeaderChange = string | null | { multiline: string };

export interface AssembleOptions {
  /** `inline` (default) inlines the engine; `cdn` loads it from jsDelivr. */
  delivery?: 'inline' | 'cdn';
  /** The exact text of `orz-paged.browser.js` for an inline file (default: this bundle's own text). */
  engineSource?: string;
  /** Resolved includes stored in `#orz-includes` exactly as given. */
  includes?: Record<string, string>;
}

export interface Extracted {
  text: string;
  kind: Kind;
  format: number;
  shell: string;
  delivery: string;
  includes?: Record<string, string>;
}

export interface Lint { level: 'error' | 'warning' | 'info'; code: string; message: string; line?: number; from?: number; to?: number }

export interface DocumentInfo {
  kind: Kind;
  format: number;
  header: { start: number; end: number; fields: Record<string, string>; keys: string[] } | null;
  meta: Record<string, unknown> & { title?: string; author?: string; uid?: string; keywords?: string[] };
  theme?: string;
  lang: string;
  settings: Record<string, string>;
  hostKeys: Record<string, string>;
  title: string;
  lint: Lint[];
}

export interface TextRange { from: number; to: number }
export interface AiOperation { id: string; title: string; selection: boolean }

export interface EditorHooks {
  /** App host: persist the text (absent: the standalone save). */
  save?(text: string): Promise<void>;
  ai?: { operations: AiOperation[]; request(op: string, ctx: { text: string; selection?: TextRange }): Promise<{ proposed: string }> };
  /** An include `includes` lacks: a URL, or a file include's path as written (your trust policy); null = not available. */
  fetchInclude?(target: string): Promise<string | null>;
  resolveAsset?(path: string): string;
  uploadAsset?(file: File): Promise<string>;
  resolveLink?(href: string): string;
  mintUid?(): Promise<string>;
}

export interface PreferenceStore {
  get(key: string): unknown;
  set(key: string, value: unknown): boolean;
  remove(key: string): void;
  all(): Record<string, unknown>;
}

export interface EditorOptions {
  text: string;
  kind?: 'paged';
  readOnly?: boolean;
  mode?: EditorMode;
  chrome?: 'full' | 'compact' | 'none';
  hooks?: EditorHooks;
  preferences?: PreferenceStore;
  /** FC-19 §3 `nonce`: your CSP nonce, stamped on the preview frame's and CodeMirror's scripts and styles (FC-19 §8.4). */
  nonce?: string;
  /** FC-19 §3 `includes`: resolved includes for the preview (target as written → text), read before `hooks.fetchInclude`; without `hooks.save` also stored in a saved file. */
  includes?: Record<string, string>;
  /** FC-19 §3 `fileName`: the suggested file name of saves without `hooks.save` (picker and download), e.g. `notes.paged.html`; default `document.paged.html`. */
  fileName?: string;
}

export type SaveVia = 'hook' | 'host' | 'file' | 'download';
export type SaveOutcome = { ok: true; via: SaveVia } | { ok: false; via?: SaveVia | 'served-notice'; error: string; cancelled?: boolean; conflict?: boolean };
export type AiOutcome = { ok: true; op: string } | { ok: false; error: string };
/** An AI proposal awaiting the reader's review (`proposeAi`); only the editor that made it can apply it (`applyAi`). */
export interface AiProposal {
  readonly op: string;
  /** The replacement the hook proposed. */
  readonly proposed: string;
  /** What it replaces: offsets in the text at the time of the request (the selection, or the whole text). */
  readonly range: Readonly<TextRange>;
  /** The exact text in `range` when the request was made. */
  readonly original: string;
  /** A passage (selection) operation; else the proposal replaces the whole document. */
  readonly passage: boolean;
}
export type AiProposalOutcome = { ok: true; op: string; proposal: AiProposal } | { ok: false; error: string };
export type UploadOutcome = { ok: true; inserted: string[] } | { ok: false; inserted: string[]; error: string };

export interface EditorEvents {
  change: { text: string };
  dirty: { dirty: boolean };
  selection: { from: number; to: number };
  save: { text: string; via: SaveVia };
  error: { source: 'save' | 'render' | 'adapter' | 'format' | 'hook'; message: string; error: unknown };
  /** The reader's Cmd/Ctrl+P in the editor or its preview: with a listener the browser's print is prevented and the listener decides (e.g. `printDocument`). */
  print: { source: 'preview' | 'editor' };
}

export interface Editor {
  getText(): string;
  setText(text: string, options?: { resetHistory?: boolean }): void;
  setHeader(changes: Record<string, HeaderChange>): void;
  undo(): boolean;
  redo(): boolean;
  isDirty(): boolean;
  markSaved(): void;
  save(): Promise<SaveOutcome>;
  setMode(mode: EditorMode): void;
  getMode(): EditorMode;
  focus(): void;
  on<E extends keyof EditorEvents>(event: E, fn: (e: EditorEvents[E]) => void): () => void;
  destroy(): void;
  /** Run an AI operation and apply its proposal at once (one undoable edit). */
  requestAi(op: string, options?: { selection?: boolean }): Promise<AiOutcome>;
  /** Run an AI operation and return its proposal without touching the text (the review flow). */
  proposeAi(op: string, options?: { selection?: boolean }): Promise<AiProposalOutcome>;
  /** Apply a reviewed proposal (optionally edited: `proposed`) as one undoable edit; refused if the text changed meanwhile. */
  applyAi(proposal: AiProposal, options?: { proposed?: string }): AiOutcome;
  uploadAssets(files: ArrayLike<File>): Promise<UploadOutcome>;
  ensureUid(): Promise<string>;
  setReadOnly(readOnly: boolean): void;
  isReadOnly(): boolean;
  /**
   * Render the preview now, also when the text has not changed. With
   * `includes`: the preview's include record is replaced by it (`null` or `{}`:
   * none) and fetched includes are read again (e.g. after the app resolved
   * one). Saves keep the includes the editor was mounted with.
   */
  refreshPreview(options?: { includes?: Record<string, string> | null }): Promise<void>;
  /** Resolves when the text engine is final: `codemirror6`, or `textarea` with the load error (the editor is usable before). */
  readonly ready: Promise<{ engine: string; error?: unknown }>;
}

export interface RenderPreviewOptions {
  fetchInclude?(target: string): Promise<string | null>;
  includes?: Readonly<Record<string, string>>;
  twinLinks?: boolean;
  /**
   * A whole HTML document (the print theme, the page and element CSS, no
   * engine script, not paginated) instead of the content's HTML (`<main
   * class="orz-doc markdown-body">`, the header's version choices applied).
   * Either way the document's own raw HTML is kept as written — show it in a
   * sandboxed frame.
   */
  document?: boolean;
  /**
   * With `document: true`: a CSP nonce stamped on the engine's `<style>` (a
   * `srcdoc` frame inherits the app's policy). The engine adds no script;
   * the document's own raw HTML is not stamped.
   */
  nonce?: string;
  /**
   * With `document: true`: a print document — the paged runtime (stamped
   * with `nonce`) lays the content out as Paged.js pages where the document
   * is opened and resolves `window.__orzPrintReady` when they are final.
   * Pass it to `printDocument` (the editor's `print` event).
   */
  pages?: boolean;
}

/** `printDocument`'s options (orz-markdown `carrier/editor`). */
export interface PrintDocumentOptions {
  /** Your CSP nonce: stamped on the script the helper adds (the frame inherits your policy). */
  nonce?: string;
  /** How long to wait for the document to be ready (`__orzPrintReady`, fonts) before printing anyway (ms; default 30 000). */
  readyTimeoutMs?: number;
  /** The hidden frame's accessible title (default `Print`). */
  title?: string;
}

export declare const kind: 'paged';
export declare const version: string;
export declare const formats: number[];
export declare function assemble(text: string, options?: AssembleOptions): Promise<string>;
export declare function extract(html: string): Extracted | null;
export declare function readDocument(text: string): DocumentInfo;
export declare function renderPreview(text: string, options?: RenderPreviewOptions): Promise<string>;
export declare function mountEditor(element: HTMLElement, options: EditorOptions): Editor;
/**
 * Print a whole document from your page without printing the page (the kit's
 * helper): a hidden `allow-scripts allow-modals` frame waits for the load,
 * the fonts and `window.__orzPrintReady`, then prints. `true` once printed,
 * `false` when the frame never spoke (a policy that blocked its script).
 */
export declare function printDocument(html: string, options?: PrintDocumentOptions): Promise<boolean>;
export declare function editHeader(text: string, changes: Readonly<Record<string, HeaderChange>>): string;
/** The print theme ids a header `theme` may name (light paper only). */
export declare const THEMES: readonly string[];
export declare const DEFAULT_THEME: string;
/** The template ids `newDocument` accepts (the 12 templates). */
export declare const TEMPLATE_IDS: readonly string[];
export declare const DEFAULT_TEMPLATE: string;
/** A new format-1 paged text from a template's skeleton (`carrier: paged`, a fresh `uid` unless given). Throws for an unknown template or theme. */
/** `date`: the date line of a letter's starter (`letter`, `cover-letter`); default: the starter's sample date. */
export declare function newDocument(options?: { template?: string; title?: string; theme?: string; uid?: string; date?: string }): string;

/** How a save from an assembled file's page went. */
export interface StandaloneSaveOutcome { ok: boolean; via?: string; error?: string; cancelled?: boolean }

/**
 * The page-side handle of an assembled `.paged.html` that booted (orz-markdown
 * `carrier/app` `CarrierApp`; `OrzCarrier.standalone`). Not part of FC-19:
 * tests, the conformance driver and scripts in a file's own page use it.
 */
export interface StandaloneFile {
  /** The current text: the document being edited (an editor mounted on the file), else the page's. */
  getText(): string;
  isDirty(): boolean;
  /** Enter edit mode (mounting the editor once) and return the editor. */
  edit(): Editor;
  /** Leave edit mode (the read view shows the current text). */
  leave(): Promise<void>;
  /** The Edit button's editor while editing, else null. */
  editor(): Editor | null;
  /** Write header settings as the pickers do (one undoable edit). */
  setSetting(changes: Record<string, HeaderChange>): void;
  undo(): boolean;
  redo(): boolean;
  /** Save the document (the editor's save while editing). Never rejects. */
  save(): Promise<StandaloneSaveOutcome>;
  download(): Promise<StandaloneSaveOutcome>;
  /** Save a new document as a new file (default: the `note` template's text; `text` a given one, `name` the suggested file name). */
  newDocument(options?: { text?: string; name?: string }): Promise<StandaloneSaveOutcome>;
  saveAsCopy(): Promise<StandaloneSaveOutcome>;
  /** The reader's choice of a reader control (`pageZoom`: `auto` | `fit` | `100` | `125`), or null. */
  readerChoice(key: string): string | null;
  /** Choose a reader control's choice (stored per uid, applied to the pages; the document is untouched). */
  setReaderChoice(key: string, id: string | null): string | null;
  /** Show a toast in the chrome. */
  toast(message: string, tone?: 'info' | 'success' | 'warning' | 'error'): void;
  /** True while a quiet update runs (the document is read-only). */
  readonly updating: boolean;
  /** Resolves when the first read view is in the page (its pages laid out). */
  readonly ready: Promise<void>;
  /** The handle's list of operations (the pencil's: Edit, Print, Save, …, the settings with Version, New document from template…, Page zoom). */
  readonly menu: { open(): void; close(): void; isOpen(): boolean };
}

export interface OrzCarrierApi {
  kind: 'paged';
  version: string;
  formats: number[];
  assemble: typeof assemble;
  extract: typeof extract;
  readDocument: typeof readDocument;
  mountEditor: typeof mountEditor;
  renderPreview: typeof renderPreview;
  printDocument: typeof printDocument;
  /** The booted file's handle in an assembled `.paged.html` (the IIFE only); null elsewhere. Not in the ES module's `OrzCarrier`. */
  readonly standalone?: StandaloneFile | null;
}
export declare const OrzCarrier: OrzCarrierApi;

declare global {
  // eslint-disable-next-line no-var
  var OrzCarrier: OrzCarrierApi | undefined;
}
