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
 *      `--orz-body-pages`), the TOC's page numbers (the TOC itself is built on
 *      the stage in step 2, so it is laid out with the pages), copy-as-Markdown
 *      on the pages.
 */
import { Chunker, Handler, Polisher, Previewer, registerHandlers } from 'pagedjs';
import { enhanceDocument } from 'orz-markdown/preview-frame';
import { applyDynamicChoices, collectDynamicChoices } from '../doc/dynamic.js';
import { BaselineGridHandler, type GridStats } from './baseline-grid.js';
import { ColsFlowHandler, type ColsStats } from './cols-flow.js';
import { INPUT_ATTRIBUTE, type PagedInput } from './input.js';
import { TableHeadHandler } from './table-head.js';
import { CodeBreakHandler, disambiguateTextNodes, keepCodeWhitespace } from './code-break.js';
import { FINAL_WAIT_MS, FIRST_WAIT_MS, LAYING_OUT_ATTRIBUTE, LATE_WAIT_MS, markUpdating, PREVIEW_ACK_MS, PREVIEW_RETRY_MS, UPDATING_ATTRIBUTE } from './constants.js';

export { FINAL_WAIT_MS, FIRST_WAIT_MS, LATE_WAIT_MS, PREVIEW_ACK_MS, UPDATING_ATTRIBUTE };

export interface PaginateOptions {
  /** False once the caller no longer wants this pagination (a newer one superseded it). */
  isCurrent?(): boolean;
  /**
   * Scale the pages to the target's width (the editor preview), never above
   * 100 % — once the layout has ended: a layout always runs at 100 %.
   */
  fit?: boolean;
  /**
   * Called with the result of the one re-flow that follows a layout made
   * before slow fonts, stylesheets or libraries arrived (see {@link paginate}).
   */
  onReflow?(result: PaginateResult): void;
  /**
   * Re-lay out from the first page the change reaches, keeping the shown
   * pages before it (the editor preview; closed loop round 3): needs the same
   * stylesheets, webfonts, front matter and versions as the shown layout,
   * else the whole document is laid out.
   */
  incremental?: boolean;
  /** With `incremental`: each new page replaces the shown one as soon as it is laid out (a copy until the end). */
  progressive?: boolean;
  /** Called once, when the first page of this layout is in view (laid out into view, swapped in, or the swap). */
  onShown?(): void;
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
  /** An incremental re-layout: the first page laid out again (1-based; the pages before it were kept). */
  from?: number;
}

export interface PagedRuntime {
  readonly version: string;
  paginate(input: PagedInput, target: HTMLElement, options?: PaginateOptions): Promise<PaginateResult>;
  /** The preview frame's render (`__orzPreviewApply`): decode the payload and paginate into `#orz-doc`. */
  applyPreview(html: string): Promise<PaginateResult | null>;
  /**
   * A print document's layout (`renderPreview(text, { document: true, pages: true })`):
   * decode the payload and paginate it into `target`; resolves when the final
   * layout is done (what the kit's `printDocument` waits for, `window.__orzPrintReady`).
   */
  layOutPayload(html: string, target: HTMLElement): Promise<void>;
  /** Resolves when no pagination runs or waits, the re-flow after late fonts or libraries included. */
  idle(): Promise<void>;
  /** True while a pagination runs or waits, or a re-flow is announced (`idle()` would wait). */
  busy(): boolean;
  /** The running pagination's progress: pages laid out so far, of about how many (the shown layout's count; 0: unknown), or null. */
  progress(): { laid: number; of: number } | null;
  /** Counts since the runtime started: paginations run, abandoned (superseded mid-way), with a styled stage (`measured`); what the session gave up waiting for (`hung`: `sheet:<href>`, `fonts:…`, `enhance:<libraries>`); table rows pulled onto the next page and tables moved whole (a header that would have stayed alone), code breaks moved to a line start. */
  stats(): { paginations: number; abandoned: number; measured: number; hung: string[]; incremental: number; last: Record<string, number>; tables: { pulled: number; movedWhole: number; rowsSplit: number; headsDropped: number }; code: { moved: number } };
}

declare const __ORZ_PAGED_RUNTIME_VERSION__: string;

const W = window as unknown as Window & {
  __orzPaged?: PagedRuntime;
  __orzPreviewApply?: (html: string, msg: unknown) => Promise<unknown>;
  __orzPreviewMessage?: (msg: unknown) => void;
  __orzPreview?: { report?(): void };
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
    watchLink(l);
    out.push(l);
  }
  return out;
}

/**
 * What this page's session found never arrives (closed loop round 3, a
 * blocked font server): `sheet:<href>` — a stylesheet that failed or did not
 * load within {@link LATE_WAIT_MS}; `fonts:<theme and webfonts>` — webfonts
 * still loading after it; `enhance:<libraries>` — content libraries (the
 * enhancement of a page needing them) that did not arrive. Later layouts
 * (the re-layouts after Done, a setting, Print) treat them as settled and lay
 * out at once with what is there — no second 22 s wait, no re-flow. A
 * stylesheet that loads after all leaves the set.
 */
const hung = new Set<string>();

/**
 * What given up on arrives after all (closed loop round 4): a hung stylesheet
 * loads (its link's late `load`), hung webfonts finish loading
 * (`document.fonts` `loadingdone`) or hung libraries arrive — the layouts
 * shown were made without them and are final (no re-flow was announced), so
 * Print would print them. Each shown target is laid out ONCE more, a whole
 * layout, a moment after the last such arrival; `idle()` waits for it.
 */
let lateTimer: ReturnType<typeof setTimeout> | undefined;
let lateDone: (() => void) | null = null;
function lateArrived(): void {
  if (!lateDone) {
    const pending = new Promise<void>((r) => { lateDone = r; });
    reflows.add(pending);
    void pending.then(() => reflows.delete(pending));
  }
  clearTimeout(lateTimer);
  lateTimer = setTimeout(() => {
    const done = lateDone!;
    lateDone = null;
    const jobs: Promise<unknown>[] = [];
    for (const [target, job] of [...shownJobs]) {
      if (!target.isConnected) { shownJobs.delete(target); continue; }
      jobs.push(paginate(job.input, target, { ...job.options, incremental: false, progressive: false, onShown: undefined })
        .then((r) => { if (!r.cancelled) job.options.onReflow?.(r); })
        .catch(() => undefined));
    }
    void Promise.all(jobs).then(done, done);
  }, LATE_SETTLE_MS);
}
/** The wait after a late arrival before the re-flow (more fonts of the same sheet arrive together). */
const LATE_SETTLE_MS = 300;

/** Mark failed stylesheet links (once per link): an errored link never fires again, a later wait on it would hang. */
function watchLink(l: HTMLLinkElement): void {
  if ((l as unknown as { __orzWatched?: boolean }).__orzWatched) return;
  (l as unknown as { __orzWatched?: boolean }).__orzWatched = true;
  const href = l.getAttribute('href') || '';
  l.addEventListener('error', () => { hung.add(`sheet:${href}`); });
  // a stylesheet given up on that loads after all: no longer hung, and the shown layouts follow it
  l.addEventListener('load', () => { if (hung.delete(`sheet:${href}`)) lateArrived(); });
}

/** Hung webfonts that finish loading after all: the shown layouts follow them (once every font has loaded, the key goes). */
function watchFonts(): void {
  const fonts = document.fonts as (FontFaceSet & EventTarget) | undefined;
  if (!fonts || typeof fonts.addEventListener !== 'function') return;
  fonts.addEventListener('loadingdone', () => {
    const keys = [...hung].filter((k) => k.startsWith('fonts:'));
    if (!keys.length) return;
    if (fonts.status === 'loaded') for (const k of keys) hung.delete(k);
    lateArrived();
  });
}

/** The stylesheet links still loading that this session has not given up on. */
function pendingLinks(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .filter((l) => l.getAttribute('media') !== 'not all' && !l.sheet && !hung.has(`sheet:${l.getAttribute('href') || ''}`));
}

/** Resolves when every stylesheet link of the page has loaded or failed (at most `ms`); links known to hang or fail count as settled. */
function stylesheetsSettled(ms: number): Promise<unknown> {
  const pending = pendingLinks().map((l) => new Promise<void>((r) => {
    watchLink(l);
    l.addEventListener('load', () => r(), { once: true });
    l.addEventListener('error', () => r(), { once: true });
  }));
  return within(Promise.all(pending), ms);
}

/** The libraries a stage's content needs (the enhancement's key in {@link hung}). */
function needsOf(root: ParentNode): string {
  return ['pre code', '.mermaid', 'canvas[data-smiles]', 'canvas.orz-chart', '.katex'].filter((q) => root.querySelector(q)).join('|');
}

/** The heading a TOC entry lists (set on the stage, kept by Paged.js on every fragment of the heading). */
const TOC_HEADING = 'data-orz-toc-h';
/** The page-number slot of a TOC entry: the index of its heading. */
const TOC_SLOT = 'data-orz-toc-for';
/** The page number a TOC entry shows while the pages are laid out: fixed width, so filling it never re-flows a page. */
const TOC_PLACEHOLDER = '000';

/**
 * Build every `.orz-toc` list from the content's headings (levels 1 to the
 * TOC's `data-max-level`) on the stage, BEFORE Paged.js lays out the pages —
 * so the list takes its place in the flow (inline or on its own pages, split
 * across pages like any list) and nothing after it is pushed off a page by a
 * list added later (closed loop round 2: a TOC filled after the layout hid a
 * report's sections). The structure is the one the print layer styles
 * (assets/themes/layers/structure.css): per heading
 * `li.orz-toc-item.orz-toc-l<level>.orz-toc-d<depth below the top level listed> > span.orz-toc-entry > span.orz-toc-text,
 * span.orz-toc-leader (the dotted leader), span.orz-toc-page` — the number a
 * fixed-width placeholder until {@link fillTocNumbers} sets it.
 */
function buildToc(root: ParentNode): void {
  const navs = Array.from(root.querySelectorAll<HTMLElement>('.orz-toc'));
  if (!navs.length) return;
  const all = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')).filter((h) =>
    // the contents list the document's sections: not its own heading, nor the title block's or the CV header's
    !h.closest('.orz-el-toc, .orz-el-article-title, .orz-el-report-title, .orz-el-exam-title, .orz-el-cv-header, .orz-toc'));
  all.forEach((h, i) => h.setAttribute(TOC_HEADING, String(i)));
  for (const nav of navs) {
    const maxLevel = Math.min(6, Math.max(1, Number(nav.getAttribute('data-max-level') || '3') || 3));
    const heads = all.filter((h) => Number(h.tagName.slice(1)) <= maxLevel);
    if (!heads.length) continue;
    const top = Math.min(...heads.map((h) => Number(h.tagName.slice(1))));
    const list = document.createElement('ol');
    list.className = 'orz-toc-list';
    for (const h of heads) {
      const level = Number(h.tagName.slice(1));
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
      n.setAttribute(TOC_SLOT, h.getAttribute(TOC_HEADING)!);
      n.textContent = TOC_PLACEHOLDER;
      entry.append(t, leader, n);
      li.append(entry);
      list.append(li);
    }
    nav.replaceChildren(list);
  }
}

/**
 * After the layout (and the front-matter renumbering): set each TOC entry's
 * page number — in every fragment of a TOC Paged.js split across pages — from
 * the page its heading STARTS on (a heading split across pages is listed once,
 * at its first fragment). Only the numbers change: no page re-flows.
 */
function fillTocNumbers(root: HTMLElement): void {
  const slots = Array.from(root.querySelectorAll<HTMLElement>(`.orz-toc-page[${TOC_SLOT}]`));
  if (!slots.length) return;
  const pageOf = new Map<string, string>();
  root.querySelectorAll<HTMLElement>(`[${TOC_HEADING}]`).forEach((h) => {
    const k = h.getAttribute(TOC_HEADING)!;
    if (pageOf.has(k)) return; // the first fragment (document order)
    const page = h.closest('.pagedjs_page') as HTMLElement | null;
    pageOf.set(k, page ? (page.style.getPropertyValue('--orz-pageno').replace(/"/g, '') || page.getAttribute('data-page-number') || '') : '');
  });
  for (const s of slots) s.textContent = pageOf.get(s.getAttribute(TOC_SLOT)!) ?? '';
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

/**
 * Scale the pages to `root`'s width (`--orz-page-zoom`), never above 1 (the
 * page's unscaled width: drawn width over the scale) — not while a layout
 * runs in `root` ({@link LAYING_OUT_ATTRIBUTE}: the layout fits it when it ends).
 */
function fitTo(root: HTMLElement): void {
  if (root.hasAttribute(LAYING_OUT_ATTRIBUTE)) return;
  const p = root.querySelector<HTMLElement>('.pagedjs_page');
  const now = Number(root.style.getPropertyValue('--orz-page-zoom')) || 1;
  const w = p ? p.getBoundingClientRect().width / now : 0;
  const avail = root.clientWidth - 24;
  const z = w > 0 && avail > 0 ? Math.min(1, avail / w) : 1;
  root.style.setProperty('--orz-page-zoom', String(Math.round(z * 1000) / 1000));
}

/** Paged.js' queue tick: the next animation frame, or a timer when none comes (a frame out of view). */
function pageTick(cb: () => void): void {
  let done = false;
  const run = (): void => { if (!done) { done = true; cb(); } };
  requestAnimationFrame(run);
  setTimeout(run, 50);
}

/** Thrown from a page hook to stop a pagination nobody wants any more (Paged.js lays out one page per frame). */
class Abandoned extends Error {}
/** While a pagination runs: true when it is no longer wanted. */
let abandonIf: (() => boolean) | null = null;

/**
 * Stops the running pagination before its next page when it is no longer
 * wanted (registered first), and lets the page's input in between the steps
 * of a pagination's setup: Paged.js lays out one page per animation frame,
 * but parses the stylesheets, then the content, then filters it, in one go —
 * a key typed meanwhile waited for all of it (closed loop round 2, E.5).
 */
class AbandonHandler extends Handler {
  constructor(chunker: unknown, polisher: unknown, caller: unknown) {
    super(chunker, polisher, caller);
    // Paged.js lays out one page per animation frame (its queue's `tick`), and Chrome gives a frame out of view — the
    // hidden print frame of the kit's `printDocument`, an editor preview below the fold — no animation frames: the
    // layout stalled until it was scrolled into view (closed loop round 3). A timer ticks it when no frame comes.
    const q = (chunker as { q?: { tick?: unknown } } | null)?.q;
    if (q) q.tick = pageTick;
  }
  private check(): void {
    if (abandonIf?.()) throw new Abandoned('orz-paged: pagination superseded');
  }
  async beforeParsed(): Promise<void> {
    flowHooks?.step?.('css');
    await later(0);
    this.check();
    flowHooks?.step?.('yield');
  }
  async afterParsed(parsed: DocumentFragment): Promise<void> {
    await later(0);
    this.check();
    flowHooks?.parsed?.(parsed, (this as unknown as { chunker: PagedChunker }).chunker);
  }
  beforePageLayout(): void {
    this.check();
  }
  finalizePage(pageElement: HTMLElement, page: { position: number }): void {
    flowHooks?.page?.(pageElement, page.position);
  }
}

/** What the runtime reads of Paged.js 0.4.3's chunker (pinned: src/chunker/chunker.js). */
interface PagedChunker {
  pagesArea: HTMLElement;
  pages: Array<{ element: HTMLElement; startToken?: { node: Node; offset: number } | null; destroy?(): void }>;
  total: number;
  breakToken: unknown;
}

/** The running pagination's hooks: after Paged.js parsed the content (a start point), after each page. */
let flowHooks: { parsed?(parsed: DocumentFragment, chunker: PagedChunker): void; page?(el: HTMLElement, index: number): void; step?(name: string): void } | null = null;

let current: Previewer | null = null;
/**
 * The paginations whose pages (or interim copies of them) are in a target:
 * their styles stay while any of their pages shows — after an incremental
 * re-layout the kept pages are the older pagination's, the rest the newer's.
 */
const live = new Set<Previewer>();
/** The pagination each shown page belongs to (its styles; {@link live}). */
const ownerOf = new WeakMap<Element, Previewer>();

/** Where a shown page starts in the content: a content element's sequence number, the child path to the node, the offset, its top-level block. */
type PageStart = { seq: number; path: number[]; offset: number; block: number };

/**
 * The shown layout of a target, for an incremental re-layout (the editor
 * preview, closed loop round 3): the top-level blocks it was laid out from,
 * what else shapes its pages (`key`: stylesheets, front matter, versions,
 * webfonts), where each page starts (null: a start that cannot be found in a
 * new parse — inside a split grid or table) and the break token class.
 */
interface ShownLayout {
  target: HTMLElement;
  key: string;
  blocks: string[];
  starts: Array<PageStart | null>;
  token: (new (node: Node, offset: number) => unknown) | null;
  /** Pages from this index on may show a newer, abandoned layout's copies: an incremental re-layout starts at most here. */
  dirtyFrom: number;
  /** Laid out before fonts or libraries arrived: the next layout is a whole one. */
  provisional: boolean;
  /**
   * Laid out on a theme's baseline grid (light-playful-1's ruling): the next
   * layout is a whole one — an incremental restart placed the blocks off the
   * whole layout's grid positions (closed loop round 4).
   */
  grid: boolean;
}
let shown: ShownLayout | null = null;

/** Paginations started (a prefix for the `data-ref`s of each). */
let paginations = 0;
/** Paginations abandoned mid-way, and stages styled and laid out for measuring (`stats()`). */
let abandoned = 0;
let measuredStages = 0;
/** Incremental re-layouts committed, and the last pagination's steps (ms since its start; `from`: its first page). */
let incrementals = 0;
/** The running pagination's pages laid out, of about how many (`progress()`). */
let running: { laid: number; of: number } | null = null;
let lastTimes: Record<string, number> = {};
/** The theme and webfonts of the last layout made with everything loaded (its fonts need no stage layout to load). */
let loadedFonts = '';
/** The theme stylesheets of the pagination shown (`current`): another theme's styles must not shape a new layout. */
let currentTheme = '';

/** The theme part of an input's stylesheets (base and theme; the page CSS changes with the header and is the same rules). */
const themeKey = (input: PagedInput): string => input.sheets.filter((s) => s.name !== 'orz-page.css').map((s) => s.css).join('\n');

/** The previewers whose pages a target shows; the others' styles go (`keep` stays whatever it shows). */
function pruneLive(target: HTMLElement, keep: Previewer | null): void {
  const owners = new Set<Previewer>();
  target.querySelectorAll('.pagedjs_page').forEach((pg) => { const o = ownerOf.get(pg); if (o) owners.add(o); });
  for (const p of [...live]) {
    if (p === keep || owners.has(p)) continue;
    live.delete(p);
    p.polisher.destroy();
  }
}

/** The pages of a target's pages container, in order. */
const pagesIn = (target: HTMLElement): HTMLElement[] => Array.from(target.querySelectorAll<HTMLElement>(':scope > .pagedjs_pages > .pagedjs_page'));

/** Switch the style elements a pagination inserted on or off (its pages stay; another pagination's styles apply). */
function styles(p: Previewer, on: boolean): void {
  const pol = p.polisher as unknown as { inserted?: HTMLStyleElement[]; styleEl?: HTMLStyleElement };
  for (const el of [...(pol.inserted ?? []), ...(pol.styleEl ? [pol.styleEl] : [])]) {
    el.disabled = !on;
    if (el.sheet) el.sheet.disabled = !on;
  }
}
let queue: Promise<unknown> = Promise.resolve();
let waiting = 0;

/** One pagination, and what was still loading when it laid out (null: nothing). */
async function paginateNow(input: PagedInput, target: HTMLElement, o: PaginateOptions & { final?: boolean }): Promise<{ result: PaginateResult; late: Promise<unknown> | null }> {
  const t0 = performance.now();
  const marks: Record<string, number> = {};
  const mark = (k: string): void => { marks[k] = Math.round(performance.now() - t0); };
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
  buildToc(stage); // the contents laid out with the pages (their numbers set after the layout)
  // the stage is styled and laid out (a whole-document style and layout pass — about a second on a long document, in
  // the editor's process) only when something needs it: fonts that may still have to load (another theme or webfonts
  // than the last complete layout's), or content enhancement draws to its size (Mermaid, charts, SMILES); otherwise
  // it is not rendered at all (each re-render while typing; closed loop round 2, E.5)
  const fontsKey = `${themeKey(input)}\n${input.links.join('\n')}`;
  const fontsKnown = fontsKey === loadedFonts && document.fonts?.status === 'loaded';
  const measured = !fontsKnown || !!stage.querySelector('.mermaid, canvas[data-smiles], canvas.orz-chart');
  const measure = document.createElement('style');
  if (measured) {
    measuredStages++;
    if (NONCE) measure.setAttribute('nonce', NONCE);
    measure.setAttribute('data-orz-paged-measure', '');
    measure.textContent = input.sheets.filter((s) => s.name !== 'orz-page.css').map((s) => s.css).join('\n');
    document.head.appendChild(measure);
  } else stage.style.display = 'none';
  document.body.appendChild(stage);
  const out = document.createElement('div');
  out.className = 'orz-paged-buffer';
  out.setAttribute('aria-hidden', 'true');
  out.style.cssText = 'position:absolute;left:-99999px;top:0;';
  let previewer: Previewer | null = null;
  let others: Previewer[] = [];
  let late: Promise<unknown> | null = null;
  try {
    // 3. enhancement, images, stylesheets, fonts — all started at once; the layout waits for them at most
    //    FIRST_WAIT_MS, then goes ahead with what has arrived and reports the rest. The final pass (the re-flow) runs
    //    after the late assets settled or LATE_WAIT_MS passed: it waits only FINAL_WAIT_MS more — a CDN that never
    //    answers must not cost a second LATE_WAIT_MS (Print waited 44 s; closed loop round 2, R.6)
    const root = (stage.querySelector('.orz-doc') as HTMLElement | null) ?? stage;
    const cap = o.final ? FINAL_WAIT_MS : FIRST_WAIT_MS;
    // static (print): everything drawn, then each drawn chart / SMILES canvas an image (Paged.js re-parses the
    // HTML); the orz runtime installed too (copy-as-Markdown on the pages, step 6)
    // what this session already found never arrives (a blocked CDN) is not waited for again (closed loop round 3)
    const needs = `enhance:${needsOf(stage)}`;
    const fontsHung = hung.has(`fonts:${fontsKey}`);
    let enhancedDone = false;
    // (libraries given up on that arrive after all: the shown layouts follow them, round 4)
    const enhancing = Promise.resolve().then(() => enhanceDocument(root, { scheme: 'light', static: true, runtime: true, ...(NONCE ? { nonce: NONCE } : {}) })).catch(() => undefined).then(() => { enhancedDone = true; if (hung.delete(needs)) lateArrived(); });
    const enhanced = hung.has(needs) ? Promise.resolve() : enhancing;
    const decoded = Promise.all(Array.from(stage.querySelectorAll('img')).map((i) => i.decode().catch(() => undefined)));
    const sheets = stylesheetsSettled(LATE_WAIT_MS);
    const assets = Promise.all([enhanced, decoded, sheets]);
    let ready = false;
    const settled = (async () => {
      await assets;
      if (!fontsKnown && !fontsHung) {
        void stage.offsetHeight; // layout: the fonts the content uses start loading
        // (reading `document.fonts.ready` lays the document out too: only when fonts may be on their way)
        if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
      }
      ready = true;
    })();
    await within(settled, cap);
    if (!ready && !fontsKnown) void stage.offsetHeight; // the fonts known so far start loading; the pages lay out with fallbacks
    if (!isCurrent()) return { result: { cancelled: true, pages: 0, cols: empty, grid: noGrid, choices, ms: performance.now() - t0, provisional: false }, late: null };
    // what is still on its way: the re-flow waits for it (the pages now in the page request the fonts)
    late = ready || o.final ? null : within((async () => {
      await assets;
      await later(0);
      void document.body.offsetHeight;
      if (document.fonts?.ready && !fontsHung) await document.fonts.ready.catch(() => undefined);
    })(), LATE_WAIT_MS).then(() => {
      // what has still not arrived (the stylesheet wait itself gives up after LATE_WAIT_MS, so the wait ending does not
      // tell): remembered for the session's later layouts
      for (const l of pendingLinks()) hung.add(`sheet:${l.getAttribute('href') || ''}`);
      if (!enhancedDone) hung.add(needs);
      if (document.fonts?.status === 'loading') hung.add(`fonts:${fontsKey}`);
    });

    // 4. Paged.js — the first layout of a target straight into it (its pages show as they are laid out, as 0.7.3's
    //    did: the first page of a long document in about a second, closed loop round 3), any later one into the
    //    off-screen buffer (double buffer) — or, in the editor preview (`incremental`), from the first page the edit
    //    changed: the pages before it are kept and the new ones replace the rest as each is laid out
    const direct = !target.querySelector('.pagedjs_page');
    if (!direct) document.body.appendChild(out);
    else {
      // laid out in view: at 100 % until it ends (a zoom or fit meanwhile changed the pagination; closed loop round 4)
      target.setAttribute(LAYING_OUT_ATTRIBUTE, '');
      target.style.setProperty('--orz-page-zoom', '1');
    }
    // a theme switch: the shown pages' styles (the old theme's rules and custom properties — its `--orz-grid` made the
    // new theme's text snap to the old ruling) would shape this layout too; they are switched off while it runs (the
    // shown pages take the new theme's styles meanwhile) and on again when it is cancelled (closed loop round 2, R.10)
    const key = themeKey(input);
    others = current && currentTheme !== key ? [...live] : [];
    for (const x of others) styles(x, false);
    await later(0); // the page's input first (the stage's setup and enhancement ran in this task)
    if (!isCurrent()) return { result: { cancelled: true, pages: 0, cols: empty, grid: noGrid, choices, ms: performance.now() - t0, provisional: false }, late: null };
    // the content for Paged.js: every element given its `data-ref` here (Paged.js' own, a random UUID per element,
    // took a third of a second on a long document), then the stage and its measuring styles leave the document
    // before the layout — so they are not laid out or restyled again with every page
    keepCodeWhitespace(stage); // after the highlighting (UPSTREAM Paged.js: whitespace between tokens skipped, text nodes found by content)
    disambiguateTextNodes(stage); // the same lookup by content outside code: repeated text between inline elements
    const blockRoot = (stage.querySelector('.orz-doc') as HTMLElement | null) ?? stage;
    const blocks = Array.from(blockRoot.children).map((e) => e.outerHTML);
    const prefix = `o${++paginations}-`;
    let refs = 0;
    stage.querySelectorAll('*').forEach((el) => { if (!el.hasAttribute('data-ref')) el.setAttribute('data-ref', prefix + (++refs).toString(36)); });
    const blockOf = new Map<number, number>();
    Array.from(blockRoot.children).forEach((b, i) => { for (const e of [b, ...Array.from(b.querySelectorAll('*'))]) { const r = e.getAttribute('data-ref') || ''; if (r.startsWith(prefix)) blockOf.set(parseInt(r.slice(prefix.length), 36), i); } });
    const layoutKey = `${input.sheets.map((x) => x.css).join('\n')}\n${input.links.join('\n')}\n${input.frontMatterClean}\n${JSON.stringify(input.dynamicChoices)}`;
    // the incremental plan: the last shown page that starts before the first changed block
    let from = 0;
    let startAt: PageStart | null = null;
    if (o.incremental && !o.final && !direct && shown && !shown.provisional && !shown.grid && shown.target === target && shown.key === layoutKey && shown.token && pagesIn(target).length === shown.starts.length) {
      let k = 0;
      while (k < blocks.length && k < shown.blocks.length && blocks[k] === shown.blocks[k]) k++;
      // an edit inside code (the first changed block holds a `pre`): a whole layout. Restarted before the fence, its
      // later pages broke the fence a line away from a fresh layout's (Paged.js checks a page's overflow every so many
      // characters and a fence measured mid-way is ended by the code-break handler; closed loop round 5, E.7)
      const codeChanged = k < blocks.length && /<pre[\s>]/i.test(blocks[k]!);
      if (!codeChanged) for (let i = Math.min(shown.starts.length, shown.dirtyFrom + 1) - 1; i >= 1; i--) {
        const st = shown.starts[i];
        if (st && st.block < k) { from = i; startAt = st; break; }
      }
    }
    mark('staged');
    const content = stage.innerHTML;
    stage.remove();
    measure.remove();
    previewer = new Previewer();
    const mine = previewer;
    ColsFlowHandler.last = null;
    BaselineGridHandler.last = null;
    // the start of an incremental re-layout: the page's start in the new parse (same sequence numbers before the
    // change), Paged.js' chunker set to continue after `from` kept pages (their count: page numbers, left and right)
    let incremental = false;
    const token = shown?.token ?? null;
    let interim = 0;
    let firstShown = false;
    const showFirst = (): void => { if (!firstShown) { firstShown = true; try { o.onShown?.(); } catch { /* the caller's */ } } };
    running = { laid: incremental ? from : 0, of: pagesIn(target).length };
    flowHooks = {
      step: mark,
      parsed(parsed, chunker) {
        mark('afterParsed');
        if (!startAt || !token) return;
        let node: Node | null = parsed.querySelector(`[data-ref="${prefix}${startAt.seq.toString(36)}"]`);
        for (const i of startAt.path) node = node ? node.childNodes[i] ?? null : null;
        if (!node) return; // not found: a full layout
        const ph = document.createElement('div');
        ph.hidden = true;
        chunker.pagesArea.appendChild(ph);
        chunker.pages = Array.from({ length: from }, () => ({ element: ph, destroy() { /* a kept page */ } }));
        chunker.total = from;
        chunker.breakToken = new token(node, startAt.offset);
        incremental = true;
        mark('parsed');
      },
      page(el, index) {
        if (running) running.laid = index + 1;
        if (direct) {
          // the first layout shows as it goes: the page is already in the target
          if (index === 0) showFirst(); // (fit to the pane only when the layout ends: never while it runs)
          ownerOf.set(el, mine);
          return;
        }
        if (!incremental || !o.progressive) return;
        // an incremental re-layout replaces the shown pages one by one (a copy now, the page itself at the end), the
        // scroll position kept: the edited page first
        const shownPages = pagesIn(target);
        const copy = el.cloneNode(true) as HTMLElement;
        copy.setAttribute('data-orz-interim', '');
        ownerOf.set(copy, mine);
        live.add(mine);
        // (the pages' CSS has `overflow-anchor: none`: the browser never moves the view for the swap either; round 4)
        const se = document.scrollingElement || document.documentElement;
        const top = se.scrollTop;
        if (shownPages[index]) shownPages[index]!.replaceWith(copy);
        else shownPages[shownPages.length - 1]?.after(copy);
        if (se.scrollTop !== top) se.scrollTop = top;
        if (shown && shown.target === target) shown.dirtyFrom = Math.min(shown.dirtyFrom, index);
        interim++;
        if (interim === 1) mark('first');
        showFirst();
      },
    };
    // a pagination nobody wants any more (a newer render, the reader typing again in the editor) stops at the next
    // page instead of laying out every page and swapping them in (closed loop round 2, E.5)
    let flow: Awaited<ReturnType<Previewer['preview']>>;
    abandonIf = () => !isCurrent();
    pagedFontsLate = null;
    pagedFontCap = o.final ? LATE_WAIT_MS : FIRST_WAIT_MS;
    try {
      flow = await previewer.preview(content, input.sheets.map((x) => ({ [x.name]: x.css })), direct ? target : out);
    } catch (e) {
      if (e instanceof Abandoned) abandoned++;
      if (e instanceof Abandoned || !isCurrent()) {
        // pages of it in view (a first layout, or the interim copies of an incremental one): its styles stay
        if (direct || interim > 0) { live.add(mine); previewer = null; if (direct) { current = mine; currentTheme = key; shown = null; } }
        return { result: { cancelled: true, pages: 0, cols: empty, grid: noGrid, choices, ms: performance.now() - t0, provisional: false }, late: null };
      }
      throw e;
    } finally {
      abandonIf = null;
      flowHooks = null;
      running = null;
    }
    // faces the layout used that had not loaded within Paged.js' bounded wait (headings, the ruling: page-only fonts
    // the stage never requested): the layout is provisional, ONE re-flow follows them (R.6, closed loop round 4)
    if (pagedFontsLate && late === null && !o.final) {
      const fontsLate = pagedFontsLate;
      late = within(fontsLate, LATE_WAIT_MS).then(() => { if (document.fonts?.status === 'loading') hung.add(`fonts:${fontsKey}`); });
    }
    pagedFontsLate = null;
    const cols = ColsFlowHandler.last ? { ...(ColsFlowHandler.last as ColsFlowHandler).stats } : empty;
    const gridStats = BaselineGridHandler.last ? { ...(BaselineGridHandler.last as BaselineGridHandler).stats, grid: Math.max(0, (BaselineGridHandler.last as BaselineGridHandler).stats.grid) } : noGrid;
    const chunker = (flow as unknown as PagedChunker);
    if (!isCurrent()) {
      if (direct || interim > 0) { live.add(mine); previewer = null; if (direct) { current = mine; currentTheme = key; shown = null; } }
      else previewer.polisher.destroy();
      return { result: { cancelled: true, pages: chunker.total, cols, grid: gridStats, choices, ms: performance.now() - t0, provisional: false }, late: null };
    }

    // 5. swap, keeping the scroll position; the old pagination's styles go only now
    const se = document.scrollingElement || document.documentElement;
    const top = se.scrollTop;
    const newPages = chunker.pages.slice(incremental ? from : 0).map((pg) => pg.element).filter((el) => el && el.classList.contains('pagedjs_page'));
    newPages.forEach((el) => ownerOf.set(el, mine));
    if (direct) {
      // already in view
    } else if (incremental) {
      const container = target.querySelector<HTMLElement>(':scope > .pagedjs_pages')!;
      pagesIn(target).slice(from).forEach((pg) => pg.remove());
      container.append(...newPages);
      container.style.setProperty('--pagedjs-page-count', String(from + newPages.length));
    } else {
      target.replaceChildren(...Array.from(out.childNodes));
    }
    se.scrollTop = top;
    current = previewer;
    currentTheme = key;
    if (late === null) loadedFonts = fontsKey;
    live.add(previewer);
    previewer = null;
    pruneLive(target, mine);
    if (!incremental) for (const x of [...live]) if (x !== mine) { live.delete(x); x.polisher.destroy(); }
    // where each shown page starts, for the next incremental re-layout
    const startOf = (t: { node: Node; offset: number } | null | undefined): PageStart | null => {
      if (!t || !t.node) return null;
      let n: Node | null = t.node;
      const path: number[] = [];
      while (n && !(n.nodeType === 1 && (n as Element).hasAttribute('data-ref'))) {
        const par: Node | null = n.parentNode;
        if (!par) return null;
        path.unshift(Array.prototype.indexOf.call(par.childNodes, n));
        n = par;
      }
      if (!n) return null;
      const el = n as Element;
      if (el.closest('.cols, table')) return null; // re-built by the handlers or Paged.js while laid out
      const ref = el.getAttribute('data-ref') || '';
      if (!ref.startsWith(prefix)) return null;
      const seq = parseInt(ref.slice(prefix.length), 36);
      const block = blockOf.get(seq);
      return block === undefined ? null : { seq, path, offset: t.offset || 0, block };
    };
    const newStarts = chunker.pages.slice(incremental ? from : 0).filter((pg) => pg.element && pg.element.classList.contains('pagedjs_page')).map((pg) => startOf(pg.startToken));
    const anyToken = chunker.pages.find((pg) => pg.startToken)?.startToken;
    shown = {
      target,
      key: layoutKey,
      blocks,
      starts: incremental && shown ? [...shown.starts.slice(0, from), ...newStarts] : newStarts,
      token: (anyToken ? (anyToken.constructor as ShownLayout['token']) : null) ?? token,
      dirtyFrom: Infinity,
      provisional: late !== null,
      grid: gridStats.grid > 0,
    };

    // 6. front matter, TOC, copy-as-Markdown, fit
    renumber(target, input.frontMatterClean);
    fillTocNumbers(target);
    target.setAttribute('data-orz-copy', '');
    try { W.OrzMarkdownRuntime?.init?.(target); } catch { /* the runtime's own error */ }
    if (o.fit) fitTo(target);
    showFirst();
    const total = incremental ? from + newPages.length : chunker.total;
    if (incremental) incrementals++;
    lastTimes = { ...marks, from: incremental ? from + 1 : 0, done: Math.round(performance.now() - t0) };
    return { result: { cancelled: false, pages: total, cols, grid: gridStats, choices, ms: performance.now() - t0, provisional: late !== null, ...(incremental ? { from: from + 1 } : {}) }, late };
  } finally {
    for (const x of others) if (live.has(x)) styles(x, true); // cancelled or failed: the shown pages keep their styles
    if (target.hasAttribute(LAYING_OUT_ATTRIBUTE)) {
      target.removeAttribute(LAYING_OUT_ATTRIBUTE);
      if (o.fit) fitTo(target); // the editor preview: fit now (a first layout, done or abandoned)
    }
    previewer?.polisher.destroy();
    stage.remove();
    out.remove();
    measure.remove();
  }
}

/** The latest request per target: a re-flow runs only while no newer request was made for its target. */
const latest = new WeakMap<HTMLElement, number>();
/** The input and options of the layout each target shows (a late font, stylesheet or library re-flows it: {@link lateArrived}). */
const shownJobs = new Map<HTMLElement, { input: PagedInput; options: PaginateOptions }>();
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
    if (!result.cancelled) shownJobs.set(target, { input, options });
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

/** Edits the editor reported since the frame started (`orz-paged-edit` messages, src/browser/carrier.ts). */
let edits = 0;

/**
 * The preview frame's render: decode the payload and paginate into `#orz-doc`.
 * An edit reported after the payload was made (the reader typing again)
 * abandons the pagination at its next page — its text is stale and a newer
 * render follows the next pause — so typing is not frozen by a layout of a
 * text already gone. The pages carry the "updating…" mark until a layout of
 * the latest text is shown; the bridge re-reports the anchors then.
 */
async function applyPreview(html: string): Promise<PaginateResult | null> {
  const doc = document.getElementById('orz-doc');
  const input = decodePreviewHtml(String(html));
  if (!doc || !doc.hasAttribute('data-orz-paged-preview') || !input) return null;
  layOutPreview(doc, input, ++previewSeq);
  return null;
}

/** One layout of the preview's render `mine` (see {@link applyPreview}). */
function layOutPreview(doc: HTMLElement, input: PagedInput, mine: number): void {
  const seen = edits;
  markUpdating(doc, true);
  const wanted = (): boolean => mine === previewSeq && edits === seen;
  const settle = (r: PaginateResult): PaginateResult => {
    if (!r.cancelled && wanted()) markUpdating(doc, false);
    if (!r.cancelled) { try { W.__orzPreview?.report?.(); } catch { /* the bridge's own error */ } }
    return r;
  };
  // an edit abandoned it and no newer render follows (an edit undone): the same text again, once the typing pauses
  const retry = (): void => {
    let quiet = edits;
    const check = (): void => {
      if (mine !== previewSeq || !doc.isConnected) return; // a newer render lays out
      if (edits !== quiet) { quiet = edits; setTimeout(check, PREVIEW_RETRY_MS); return; }
      layOutPreview(doc, input, mine);
    };
    setTimeout(check, PREVIEW_RETRY_MS);
  };
  // the edited page first: the layout starts at the first page the edit changed (the pages before it are kept) and
  // each new page replaces the shown one as it is laid out. The render is acknowledged at once — the layout runs on
  // and a newer render abandons it at its next page — so the kit paces renders by the renderer alone (its pause:
  // the debounce, or twice the text's render), not by the frame's layout: one key to the edited page in about a
  // second on a 35-page report (7.7–9.1 s before; closed loop round 3)
  void paginate(input, doc, { fit: true, incremental: true, progressive: true, isCurrent: wanted, onReflow: (r) => { settle(r); } })
    .then((r) => { settle(r); if (r.cancelled && mine === previewSeq) retry(); })
    .catch((e) => { try { console.error("orz-paged: the preview could not be laid out", e); } catch { /* no console */ } });
}

/** A print document's layout (see {@link PagedRuntime.layOutPayload}). */
async function layOutPayload(html: string, target: HTMLElement): Promise<void> {
  const input = decodePreviewHtml(String(html));
  if (!input || !target) return;
  await paginate(input, target);
  await idle();
}

/** The editor's own messages to the frame (the kit's `preview.post` → `__orzPreviewMessage`). */
function previewMessage(m: unknown): void {
  if (!m || typeof m !== 'object' || (m as { type?: unknown }).type !== 'orz-paged-edit') return;
  edits++;
  const doc = document.getElementById('orz-doc');
  if (doc) markUpdating(doc, true);
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

/**
 * UPSTREAM Paged.js 0.4.3: `Chunker.flow` awaits `loadFonts()`, which loads
 * EVERY font face of the document not yet loaded and waits for all of them,
 * unbounded — a font server that answers the stylesheet but never a font
 * file kept the page blank for good (closed loop round 4; the round-3 tests
 * held the stylesheet itself, so no face was declared). The wait stays (the
 * faces a theme uses only on the pages — headings, the ruled paper — load
 * here, before the layout measures them) but is bounded: at most
 * `FIRST_WAIT_MS` (a layout whose faces were still loading then is
 * provisional: its ONE re-flow waits up to `LATE_WAIT_MS` for them), and none
 * once the session found webfonts that never arrive (`hung`); what arrives
 * later still re-flows the pages (R.6, R.17).
 */
function boundPagedFontWait(): void {
  const proto = Chunker.prototype as unknown as { loadFonts(): Promise<unknown> };
  const load = proto.loadFonts;
  proto.loadFonts = function (this: unknown): Promise<unknown> {
    const waiting = load.call(this);
    if ([...hung].some((k) => k.startsWith('fonts:'))) return Promise.resolve();
    let done = false;
    void waiting.then(() => { done = true; }, () => { done = true; });
    // faces still loading after the cap: this layout is provisional, its re-flow follows them (paginateNow)
    return within(waiting, pagedFontCap).then(() => { pagedFontsLate = done ? null : waiting; });
  };
}
/** Paged.js' font wait in the running pagination: `FIRST_WAIT_MS`, or `LATE_WAIT_MS` for a final pass (the re-flow lays out with the fonts). */
let pagedFontCap = FIRST_WAIT_MS;
/** Font faces Paged.js' bounded wait gave up on in the running pagination (null: none). */
let pagedFontsLate: Promise<unknown> | null = null;

if (!W.__orzPaged) {
  registerHandlers(AbandonHandler, BaselineGridHandler, ColsFlowHandler, TableHeadHandler, CodeBreakHandler); // the grid before the columns: a block is placed before the column handler measures it
  stampPagedStyles();
  boundPagedFontWait();
  watchFonts();
  const api: PagedRuntime = Object.freeze({
    version: typeof __ORZ_PAGED_RUNTIME_VERSION__ === 'string' ? __ORZ_PAGED_RUNTIME_VERSION__ : '',
    paginate,
    applyPreview,
    layOutPayload,
    idle,
    busy: () => waiting > 0 || reflows.size > 0,
    progress: () => (running ? { ...running } : null),
    stats: () => ({ paginations, abandoned, measured: measuredStages, incremental: incrementals, last: { ...lastTimes }, hung: [...hung].map((k) => k.split('\n')[0]!.slice(0, 120)), tables: { pulled: TableHeadHandler.pulled, movedWhole: TableHeadHandler.movedWhole, rowsSplit: TableHeadHandler.rowsSplit, headsDropped: TableHeadHandler.headsDropped }, code: { moved: CodeBreakHandler.moved } }),
  });
  W.__orzPaged = api;
  // the preview frame's page hook (FC-19 §8.4): the bridge acknowledges the render when it settles
  W.__orzPreviewApply = (html: string) => applyPreview(html);
  W.__orzPreviewMessage = previewMessage;
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
