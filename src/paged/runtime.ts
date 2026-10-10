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
 *      KaTeX's stylesheet), images decoded, stylesheets loaded and
 *      `document.fonts.ready` (pagination depends on final heights) — all
 *      started at once and awaited at most {@link FIRST_WAIT_MS}: a slow CDN
 *      never keeps the page blank; what had not arrived makes the result
 *      `provisional`, and ONE re-flow follows when it settles (R.6);
 *      `static: true`: drawn canvases become images (Paged.js re-parses the HTML);
 *   4. Paged.js into an off-screen container (double buffer), with the
 *      baseline-grid handler (src/paged/baseline-grid.ts: a theme's ruling
 *      under the text) and the two-column handler; one pagination at a time, only the latest request
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
import { BaselineGridHandler, type GridStats } from './baseline-grid.js';
import { ColsFlowHandler, type ColsStats } from './cols-flow.js';
import { INPUT_ATTRIBUTE, type PagedInput } from './input.js';

export interface PaginateOptions {
  /** False once the caller no longer wants this pagination (a newer one superseded it). */
  isCurrent?(): boolean;
  /** Scale the pages to the target's width (the editor preview), never above 100 %. */
  fit?: boolean;
  /**
   * Called with the result of the one re-flow that follows a layout made
   * before slow fonts, stylesheets or libraries arrived (see {@link paginate}).
   */
  onReflow?(result: PaginateResult): void;
}

export interface PaginateResult {
  /** True when a newer request superseded this one before its pages were shown. */
  cancelled: boolean;
  /** Pages laid out. */
  pages: number;
  /** What the `.cols` blocks did. */
  cols: ColsStats;
  /** What the baseline grid did (a theme with a ruled page, light-playful-1; `grid` 0 otherwise). */
  grid: GridStats;
  /** The dynamic choice keys the content uses, with the values seen (before applying them). */
  choices: Record<string, string[]>;
  /** Milliseconds, start to swap. */
  ms: number;
  /**
   * True when these pages were laid out before everything the content needs
   * had arrived (fonts, stylesheets, libraries, images still loading after
   * {@link FIRST_WAIT_MS}): one re-flow follows when they settle.
   */
  provisional: boolean;
}

export interface PagedRuntime {
  readonly version: string;
  paginate(input: PagedInput, target: HTMLElement, options?: PaginateOptions): Promise<PaginateResult>;
  /** The preview frame's render (`__orzPreviewApply`): decode the payload and paginate into `#orz-doc`. */
  applyPreview(html: string): Promise<PaginateResult | null>;
  /** Resolves when no pagination runs or waits, the re-flow after late fonts or libraries included. */
  idle(): Promise<void>;
}

declare const __ORZ_PAGED_RUNTIME_VERSION__: string;

const W = window as unknown as Window & {
  __orzPaged?: PagedRuntime;
  __orzPreviewApply?: (html: string, msg: unknown) => Promise<unknown>;
  OrzMarkdownRuntime?: { init?(root: unknown): void };
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

/**
 * How long a layout waits for the content's fonts, stylesheets, libraries
 * (enhancement) and images before it lays out the pages with what has
 * arrived (fallback fonts, unenhanced content): a slow or hanging CDN never
 * keeps the page blank (R.6).
 */
export const FIRST_WAIT_MS = 2000;
/** How long the late assets are awaited for the one re-flow after a provisional layout (and Print, which waits for it). */
export const LATE_WAIT_MS = 20_000;
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
 * Fill `.orz-toc` with the headings of the pages (levels 1 to the TOC's
 * `data-max-level`) and their page numbers, in the structure the print
 * layer styles (assets/themes/layers/structure.css): per heading
 * `li.orz-toc-item.orz-toc-l<level>.orz-toc-d<depth below the top level listed> > span.orz-toc-entry > span.orz-toc-text,
 * span.orz-toc-leader (the dotted leader), span.orz-toc-page` — the number
 * right-aligned after the leader, never against the text.
 */
function fillToc(root: HTMLElement): void {
  const nav = root.querySelector('.orz-toc');
  if (!nav) return;
  const maxLevel = Math.min(6, Math.max(1, Number(nav.getAttribute('data-max-level') || '3') || 3));
  const list = document.createElement('ol');
  list.className = 'orz-toc-list';
  const levels = Array.from({ length: maxLevel }, (_, i) => `.pagedjs_page_content h${i + 1}`).join(', ');
  const heads = Array.from(root.querySelectorAll<HTMLElement>(levels)).filter((h) =>
    // the contents list the document's sections: not its own heading, nor the title block's or the CV header's;
    // a heading Paged.js split across pages (its continuation) is listed once
    !h.closest('.orz-el-toc, .orz-el-article-title, .orz-el-report-title, .orz-el-exam-title, .orz-el-cv-header') && !h.hasAttribute('data-split-from'));
  const top = Math.min(...heads.map((h) => Number(h.tagName.slice(1))));
  heads.forEach((h) => {
    const level = Number(h.tagName.slice(1));
    if (level > maxLevel) return;
    const page = h.closest('.pagedjs_page') as HTMLElement | null;
    const no = page ? (page.style.getPropertyValue('--orz-pageno').replace(/"/g, '') || page.getAttribute('data-page-number') || '') : '';
    const li = document.createElement('li');
    li.className = `orz-toc-item orz-toc-l${level} orz-toc-d${level - top + 1}`;
    const entry = document.createElement('span');
    entry.className = 'orz-toc-entry';
    const t = document.createElement('span');
    t.className = 'orz-toc-text';
    t.textContent = (h.textContent || '').trim();
    const leader = document.createElement('span');
    leader.className = 'orz-toc-leader';
    leader.setAttribute('aria-hidden', 'true');
    const n = document.createElement('span');
    n.className = 'orz-toc-page';
    n.textContent = no;
    entry.append(t, leader, n);
    li.append(entry);
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

/** One pagination, and what was still loading when it laid out (null: nothing). */
async function paginateNow(input: PagedInput, target: HTMLElement, o: PaginateOptions & { final?: boolean }): Promise<{ result: PaginateResult; late: Promise<unknown> | null }> {
  const t0 = performance.now();
  const empty: ColsStats = { fits: 0, split: 0, moved: 0, fallback: 0 };
  const noGrid: GridStats = { grid: 0, ruleAt: 0, snapped: 0, offGrid: 0 };
  const isCurrent = (): boolean => (o.isCurrent ? o.isCurrent() : true);
  if (!isCurrent()) return { result: { cancelled: true, pages: 0, cols: empty, grid: noGrid, choices: {}, ms: 0, provisional: false }, late: null };

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
  let late: Promise<unknown> | null = null;
  try {
    // 3. enhancement, images, stylesheets, fonts — all started at once; the layout waits for them at most
    //    FIRST_WAIT_MS (a final pass: LATE_WAIT_MS), then goes ahead with what has arrived and reports the rest
    const root = (stage.querySelector('.orz-doc') as HTMLElement | null) ?? stage;
    const cap = o.final ? LATE_WAIT_MS : FIRST_WAIT_MS;
    // static (print): everything drawn, then each drawn chart / SMILES canvas an image (Paged.js re-parses the
    // HTML); the orz runtime installed too (copy-as-Markdown on the pages, step 6)
    const enhanced = Promise.resolve().then(() => enhanceDocument(root, { scheme: 'light', static: true, runtime: true, ...(NONCE ? { nonce: NONCE } : {}) })).catch(() => undefined);
    const decoded = Promise.all(Array.from(stage.querySelectorAll('img')).map((i) => i.decode().catch(() => undefined)));
    const sheets = stylesheetsSettled(LATE_WAIT_MS);
    const assets = Promise.all([enhanced, decoded, sheets]);
    let ready = false;
    const settled = (async () => {
      await assets;
      void stage.offsetHeight; // layout: the fonts the content uses start loading
      if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
      ready = true;
    })();
    await within(settled, cap);
    if (!ready) void stage.offsetHeight; // the fonts known so far start loading; the pages lay out with fallbacks
    if (!isCurrent()) return { result: { cancelled: true, pages: 0, cols: empty, grid: noGrid, choices, ms: performance.now() - t0, provisional: false }, late: null };
    // what is still on its way: the re-flow waits for it (the pages now in the page request the fonts)
    late = ready || o.final ? null : within((async () => {
      await assets;
      await later(0);
      void document.body.offsetHeight;
      if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
    })(), LATE_WAIT_MS);

    // 4. Paged.js into the off-screen buffer
    document.body.appendChild(out);
    previewer = new Previewer();
    ColsFlowHandler.last = null;
    BaselineGridHandler.last = null;
    const flow = await previewer.preview(stage.innerHTML, input.sheets.map((s) => ({ [s.name]: s.css })), out);
    const cols = ColsFlowHandler.last ? { ...(ColsFlowHandler.last as ColsFlowHandler).stats } : empty;
    const gridStats = BaselineGridHandler.last ? { ...(BaselineGridHandler.last as BaselineGridHandler).stats, grid: Math.max(0, (BaselineGridHandler.last as BaselineGridHandler).stats.grid) } : noGrid;
    if (!isCurrent()) {
      previewer.polisher.destroy();
      return { result: { cancelled: true, pages: flow.total, cols, grid: gridStats, choices, ms: performance.now() - t0, provisional: false }, late: null };
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
    return { result: { cancelled: false, pages: flow.total, cols, grid: gridStats, choices, ms: performance.now() - t0, provisional: late !== null }, late };
  } finally {
    previewer?.polisher.destroy();
    stage.remove();
    out.remove();
    measure.remove();
  }
}

/** The latest request per target: a re-flow runs only while no newer request was made for its target. */
const latest = new WeakMap<HTMLElement, number>();
let requests = 0;
/** Re-flows announced but not yet done (idle() waits for them: Print prints the final layout). */
const reflows = new Set<Promise<unknown>>();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  waiting++;
  const run = queue.then(job);
  queue = run.catch(() => undefined).then(() => { waiting--; });
  return run;
}

/**
 * Paginate `input` into `target` (one at a time, in order). The pages show as
 * soon as they are laid out — after at most {@link FIRST_WAIT_MS} of waiting
 * for fonts, stylesheets, libraries and images (R.6). When some had not
 * arrived, the result is `provisional` and ONE re-flow follows once they
 * settle (at most {@link LATE_WAIT_MS}): the same input laid out again, the
 * scroll position kept, unless a newer request for the target came first;
 * `options.onReflow` gets its result, and `idle()` waits for it.
 */
function paginate(input: PagedInput, target: HTMLElement, options: PaginateOptions = {}): Promise<PaginateResult> {
  const mine = ++requests;
  latest.set(target, mine);
  const wanted = (): boolean => latest.get(target) === mine && (options.isCurrent ? options.isCurrent() : true);
  return enqueue(() => paginateNow(input, target, options)).then(({ result, late }) => {
    if (late && !result.cancelled) {
      const reflow = late.then(() => (wanted() ? enqueue(() => paginateNow(input, target, { ...options, isCurrent: wanted, final: true })) : null))
        .then((r) => { if (r && !r.result.cancelled) options.onReflow?.(r.result); })
        .catch(() => undefined);
      reflows.add(reflow);
      void reflow.then(() => reflows.delete(reflow));
    }
    return result;
  });
}

/** Resolves when no pagination runs or waits, and no announced re-flow is pending. */
async function idle(): Promise<void> {
  for (;;) {
    const q = queue;
    await q;
    if (reflows.size > 0) { await Promise.all([...reflows]); continue; }
    if (q === queue) return;
  }
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
  registerHandlers(BaselineGridHandler, ColsFlowHandler); // the grid first: a block is placed before the column handler measures it
  stampPagedStyles();
  const api: PagedRuntime = Object.freeze({
    version: typeof __ORZ_PAGED_RUNTIME_VERSION__ === 'string' ? __ORZ_PAGED_RUNTIME_VERSION__ : '',
    paginate,
    applyPreview,
    idle,
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
