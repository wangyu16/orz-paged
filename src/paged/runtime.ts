/**
 * The paged runtime: Paged.js 0.4.3 with the two-column handler, as ONE
 * script that runs in two places —
 *
 * - the assembled file's page (the read view, src/browser/paged/read-view.ts,
 *   injects it once as an inline script: the pages are laid out IN THE PAGE,
 *   print-ready, REBUILD §3b decision 5), and
 * - the editor's sandboxed preview frame (FC-19 §8.4 pluggable preview: the
 *   frame document of src/browser/paged/preview.ts carries it, nonce-stamped,
 *   and its `window.__orzPreviewApply` paginates each render).
 *
 * It is built separately (build/bundle.ts: an IIFE, script-safe and ASCII
 * like the engine) and carried by the engine bundle as a string, so Paged.js
 * (about 500 KB) is in the engine once and the frame needs no network for
 * it. It sets `globalThis.__orzPaged` (once) and touches nothing else until
 * called.
 *
 * One pagination (`paginate(input, target)`), in order:
 *   1. the content's stylesheet links in `<head>` (nonce-stamped), loaded;
 *   2. the body on an off-screen stage, the dynamic choices applied (content
 *      that does not match is removed), styled by the theme for measuring;
 *   3. enhancement — orz-markdown's `enhanceDocument` (highlight.js, Mermaid,
 *      SMILES, Chart.js from their pinned URLs, only what the content needs;
 *      KaTeX's stylesheet) — awaited; then images decoded, stylesheets loaded
 *      and `document.fonts.ready` (pagination depends on final heights);
 *      drawn canvases become images (Paged.js re-parses the HTML);
 *   4. Paged.js into an off-screen container (double buffer), with the
 *      two-column handler; one pagination at a time, only the latest request
 *      runs after a busy one (a superseded request resolves `cancelled`);
 *   5. the pages swapped into `target` with the scroll position kept, the old
 *      pagination's styles removed only then (no unstyled flash);
 *   6. front-matter renumbering (`--orz-pageno` per body page,
 *      `--orz-body-pages`), the TOC's page numbers, copy-as-Markdown on the
 *      pages.
 */
import { Polisher, Previewer, registerHandlers } from 'pagedjs';
import { enhanceDocument } from 'orz-markdown/preview-frame';
import { applyDynamicChoices, collectDynamicChoices } from '../doc/dynamic.js';
import { ColsFlowHandler, type ColsStats } from './cols-flow.js';
import { INPUT_ATTRIBUTE, type PagedInput } from './input.js';

export interface PaginateOptions {
  /** False once the caller no longer wants this pagination (a newer one superseded it). */
  isCurrent?(): boolean;
  /** Scale the pages to the target's width (the editor preview), never above 100 %. */
  fit?: boolean;
}

export interface PaginateResult {
  /** True when a newer request superseded this one before its pages were shown. */
  cancelled: boolean;
  /** Pages laid out. */
  pages: number;
  /** What the `.cols` blocks did. */
  cols: ColsStats;
  /** The dynamic choice keys the content uses, with the values seen (before applying them). */
  choices: Record<string, string[]>;
  /** Milliseconds, start to swap. */
  ms: number;
}

export interface PagedRuntime {
  readonly version: string;
  paginate(input: PagedInput, target: HTMLElement, options?: PaginateOptions): Promise<PaginateResult>;
  /** The preview frame's render (`__orzPreviewApply`): decode the payload and paginate into `#orz-doc`. */
  applyPreview(html: string): Promise<PaginateResult | null>;
  /** Resolves when no pagination runs or waits. */
  idle(): Promise<void>;
}

declare const __ORZ_PAGED_RUNTIME_VERSION__: string;

const W = window as unknown as Window & {
  __orzPaged?: PagedRuntime;
  __orzPreviewApply?: (html: string, msg: unknown) => Promise<unknown>;
  OrzMarkdownRuntime?: { init?(root: unknown): void };
  Chart?: { getChart?(c: HTMLCanvasElement): { stop?(): void; update?(mode?: string): void } | undefined };
};

/** The nonce this script was given (the preview frame under an app's nonce policy), stamped on what it adds. */
const NONCE: string | undefined = (() => {
  try {
    const s = document.currentScript as HTMLScriptElement | null;
    return (s && (s.nonce || s.getAttribute('nonce'))) || undefined;
  } catch {
    return undefined;
  }
})();

const later = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const within = <T>(p: Promise<T>, ms: number): Promise<T | void> => Promise.race([p, later(ms)]);

/** Add the stylesheet links the content needs (once each). */
function ensureLinks(urls: readonly string[]): HTMLLinkElement[] {
  const out: HTMLLinkElement[] = [];
  for (const href of urls) {
    if (!href) continue;
    let l = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).find((x) => x.getAttribute('href') === href) ?? null;
    if (!l) {
      l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      if (NONCE) l.setAttribute('nonce', NONCE);
      document.head.appendChild(l);
    } else if (l.getAttribute('media') === 'not all') {
      l.removeAttribute('media'); // a deferred shell link (the assembled file's head): switch it on
    }
    out.push(l);
  }
  return out;
}

/** Resolves when every stylesheet link of the page has loaded or failed (at most `ms`). */
function stylesheetsSettled(ms: number): Promise<unknown> {
  const pending = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .filter((l) => l.getAttribute('media') !== 'not all' && !l.sheet)
    .map((l) => new Promise<void>((r) => {
      l.addEventListener('load', () => r(), { once: true });
      l.addEventListener('error', () => r(), { once: true });
    }));
  return within(Promise.all(pending), ms);
}

/**
 * A drawn canvas as an image, so it survives the HTML Paged.js re-parses.
 * KIT GAP (orz-markdown 2.3.0): `enhanceDocument` draws for the screen
 * (Chart.js instances it tracks, SMILES canvases); a print layout needs the
 * drawings settled and static — the kit could offer `{ static: true }`.
 */
function freezeCanvas(canvas: HTMLCanvasElement): void {
  try {
    const chart = W.Chart?.getChart?.(canvas);
    chart?.stop?.();
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    img.className = canvas.className;
    const w = canvas.style.width || (canvas.clientWidth ? `${canvas.clientWidth}px` : '');
    img.style.maxWidth = '100%';
    if (w) img.style.width = w;
    const md = canvas.getAttribute('data-md');
    if (md !== null) img.setAttribute('data-md', md); // the copy-as-Markdown breadcrumb
    canvas.replaceWith(img);
  } catch {
    /* a tainted or empty canvas stays */
  }
}

/** Fill `.orz-toc` with the headings of the pages and their page numbers. */
function fillToc(root: HTMLElement): void {
  const nav = root.querySelector('.orz-toc');
  if (!nav) return;
  const maxLevel = Number(nav.getAttribute('data-max-level') || '3');
  const list = document.createElement('ol');
  list.className = 'orz-toc-list';
  root.querySelectorAll<HTMLElement>('.pagedjs_page_content h1, .pagedjs_page_content h2, .pagedjs_page_content h3, .pagedjs_page_content h4').forEach((h) => {
    // the contents list the document's sections: not its own heading, nor the title block's or the CV header's
    if (h.closest('.orz-el-toc, .orz-el-article-title, .orz-el-report-title, .orz-el-exam-title, .orz-el-cv-header')) return;
    const level = Number(h.tagName.slice(1));
    if (level > maxLevel) return;
    const page = h.closest('.pagedjs_page') as HTMLElement | null;
    const no = page ? (page.style.getPropertyValue('--orz-pageno').replace(/"/g, '') || page.getAttribute('data-page-number') || '') : '';
    const li = document.createElement('li');
    li.className = `orz-toc-item orz-toc-l${level}`;
    const t = document.createElement('span');
    t.className = 'orz-toc-text';
    t.textContent = h.textContent || '';
    const n = document.createElement('span');
    n.className = 'orz-toc-page';
    n.textContent = no;
    li.append(t, n);
    list.append(li);
  });
  if (list.childElementCount) nav.replaceChildren(list);
}

/** Clean front matter: number the body pages 1, 2, … (Paged.js' counter is unreliable across later breaks). */
function renumber(root: HTMLElement, on: boolean): void {
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.pagedjs_page'));
  if (!on) {
    document.documentElement.style.removeProperty('--orz-body-pages');
    return;
  }
  const body = pages.filter((p) => !p.classList.contains('pagedjs_orz-front_page'));
  document.documentElement.style.setProperty('--orz-body-pages', `"${body.length}"`);
  body.forEach((p, i) => p.style.setProperty('--orz-pageno', `"${i + 1}"`));
}

/** Scale the pages to `root`'s width (`--orz-page-zoom`), never above 1 (the page's unscaled width: drawn width over the scale). */
function fitTo(root: HTMLElement): void {
  const p = root.querySelector<HTMLElement>('.pagedjs_page');
  const now = Number(root.style.getPropertyValue('--orz-page-zoom')) || 1;
  const w = p ? p.getBoundingClientRect().width / now : 0;
  const avail = root.clientWidth - 24;
  const z = w > 0 && avail > 0 ? Math.min(1, avail / w) : 1;
  root.style.setProperty('--orz-page-zoom', String(Math.round(z * 1000) / 1000));
}

let current: Previewer | null = null;
let queue: Promise<unknown> = Promise.resolve();
let waiting = 0;

async function paginateNow(input: PagedInput, target: HTMLElement, o: PaginateOptions): Promise<PaginateResult> {
  const t0 = performance.now();
  const empty: ColsStats = { fits: 0, split: 0, moved: 0, fallback: 0 };
  const isCurrent = (): boolean => (o.isCurrent ? o.isCurrent() : true);
  if (!isCurrent()) return { cancelled: true, pages: 0, cols: empty, choices: {}, ms: 0 };

  // 1. the content's stylesheet links
  ensureLinks(input.links);

  // 2. the stage: off-screen, the theme applied for measuring (its fonts start loading)
  const stage = document.createElement('div');
  stage.className = 'orz-paged-stage';
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:absolute;left:-99999px;top:0;width:680px;';
  stage.innerHTML = input.bodyHtml;
  const choices = collectDynamicChoices(stage);
  applyDynamicChoices(stage, input.dynamicChoices);
  const measure = document.createElement('style');
  if (NONCE) measure.setAttribute('nonce', NONCE);
  measure.setAttribute('data-orz-paged-measure', '');
  measure.textContent = input.sheets.filter((s) => s.name !== 'orz-page.css').map((s) => s.css).join('\n');
  document.head.appendChild(measure);
  document.body.appendChild(stage);
  const out = document.createElement('div');
  out.className = 'orz-paged-buffer';
  out.setAttribute('aria-hidden', 'true');
  out.style.cssText = 'position:absolute;left:-99999px;top:0;';
  let previewer: Previewer | null = null;
  try {
    // 3. enhancement, images, stylesheets, fonts
    const root = (stage.querySelector('.orz-doc') as HTMLElement | null) ?? stage;
    await within(enhanceDocument(root, { scheme: 'light', ...(NONCE ? { nonce: NONCE } : {}) }), 20_000).catch(() => undefined);
    await within(Promise.all(Array.from(stage.querySelectorAll('img')).map((i) => i.decode().catch(() => undefined))), 6000);
    await stylesheetsSettled(8000);
    void stage.offsetHeight; // layout: the fonts the content uses start loading
    if (document.fonts?.ready) await within(document.fonts.ready, 8000).catch(() => undefined);
    stage.querySelectorAll('canvas').forEach((c) => freezeCanvas(c as HTMLCanvasElement));
    if (!isCurrent()) return { cancelled: true, pages: 0, cols: empty, choices, ms: performance.now() - t0 };

    // 4. Paged.js into the off-screen buffer
    document.body.appendChild(out);
    previewer = new Previewer();
    ColsFlowHandler.last = null;
    const flow = await previewer.preview(stage.innerHTML, input.sheets.map((s) => ({ [s.name]: s.css })), out);
    const cols = ColsFlowHandler.last ? { ...(ColsFlowHandler.last as ColsFlowHandler).stats } : empty;
    if (!isCurrent()) {
      previewer.polisher.destroy();
      return { cancelled: true, pages: flow.total, cols, choices, ms: performance.now() - t0 };
    }

    // 5. swap, keeping the scroll position; the old pagination's styles go only now
    const se = document.scrollingElement || document.documentElement;
    const top = se.scrollTop;
    target.replaceChildren(...Array.from(out.childNodes));
    se.scrollTop = top;
    const old = current;
    current = previewer;
    previewer = null;
    old?.polisher.destroy();

    // 6. front matter, TOC, copy-as-Markdown, fit
    renumber(target, input.frontMatterClean);
    fillToc(target);
    target.setAttribute('data-orz-copy', '');
    try { W.OrzMarkdownRuntime?.init?.(target); } catch { /* the runtime's own error */ }
    if (o.fit) fitTo(target);
    return { cancelled: false, pages: flow.total, cols, choices, ms: performance.now() - t0 };
  } finally {
    previewer?.polisher.destroy();
    stage.remove();
    out.remove();
    measure.remove();
  }
}

function paginate(input: PagedInput, target: HTMLElement, options: PaginateOptions = {}): Promise<PaginateResult> {
  waiting++;
  const run = queue.then(() => paginateNow(input, target, options));
  queue = run.catch(() => undefined).then(() => { waiting--; });
  return run;
}

/** The payload of the editor's renderer (src/paged/input.ts `encodePreviewHtml`), decoded. */
function decodePreviewHtml(html: string): PagedInput | null {
  const t = document.createElement('template');
  t.innerHTML = html;
  const scripts = t.content.querySelectorAll(`script[${INPUT_ATTRIBUTE}]`);
  const s = scripts[scripts.length - 1];
  if (!s) return null;
  let rest: Omit<PagedInput, 'bodyHtml'>;
  try {
    rest = JSON.parse(s.textContent || '');
  } catch {
    return null;
  }
  s.remove();
  return { ...rest, bodyHtml: t.innerHTML };
}

let previewSeq = 0;

async function applyPreview(html: string): Promise<PaginateResult | null> {
  const doc = document.getElementById('orz-doc');
  const input = decodePreviewHtml(String(html));
  if (!doc || !doc.hasAttribute('data-orz-paged-preview') || !input) return null;
  const mine = ++previewSeq;
  return paginate(input, doc, { fit: true, isCurrent: () => mine === previewSeq });
}

/**
 * Under an app's nonce policy (FC-19 §8.4 CSP recipe) the `<style>` elements
 * Paged.js inserts carry the nonce: its polisher's `setup` (the base styles
 * and the empty sheet its counters insert rules into) and `insert` (each
 * stylesheet) are its only `<style>` writers (Paged.js 0.4.3, pinned:
 * src/polisher/polisher.js); while they run, a style element appended to
 * `<head>` is stamped first. Without a nonce nothing is changed.
 */
function stampPagedStyles(): void {
  if (!NONCE) return;
  const nonce = NONCE;
  const proto = Polisher.prototype as unknown as Record<'setup' | 'insert', (...a: unknown[]) => unknown>;
  let depth = 0; // setup calls insert: the stamp stays until the outermost call returns
  const stamped = (fn: (...a: unknown[]) => unknown) => function (this: unknown, ...args: unknown[]): unknown {
    const head = document.head as unknown as { appendChild: (n: Node) => Node };
    if (depth++ === 0) {
      head.appendChild = function appendChild(this: Node, n: Node): Node {
        if (n instanceof HTMLStyleElement && !n.hasAttribute('nonce')) n.setAttribute('nonce', nonce);
        return Node.prototype.appendChild.call(this, n);
      };
    }
    try {
      return fn.apply(this, args);
    } finally {
      if (--depth === 0) delete (head as { appendChild?: unknown }).appendChild;
    }
  };
  proto.setup = stamped(proto.setup);
  proto.insert = stamped(proto.insert);
}

if (!W.__orzPaged) {
  registerHandlers(ColsFlowHandler);
  stampPagedStyles();
  const api: PagedRuntime = Object.freeze({
    version: typeof __ORZ_PAGED_RUNTIME_VERSION__ === 'string' ? __ORZ_PAGED_RUNTIME_VERSION__ : '',
    paginate,
    applyPreview,
    idle: () => queue.then(() => undefined),
  });
  W.__orzPaged = api;
  // the preview frame's page hook (FC-19 §8.4): the bridge acknowledges the render when it settles
  W.__orzPreviewApply = (html: string) => applyPreview(html);
  // the editor preview's pages follow the pane's width
  if (typeof ResizeObserver === 'function') {
    let pending = 0;
    new ResizeObserver(() => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        const doc = document.getElementById('orz-doc');
        if (doc && doc.hasAttribute('data-orz-paged-preview')) fitTo(doc);
      });
    }).observe(document.documentElement);
  }
}
