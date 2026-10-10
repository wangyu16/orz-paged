/**
 * KIND-SPECIFIC (paged): the read view of an assembled `.paged.html` — the
 * document laid out as Paged.js pages IN THE PAGE (`#orz-pages`), print-ready
 * (REBUILD §3b decision 5: Print prints exactly this). The kit's app
 * (`carrier/app`) drives it through `CarrierReadView` (spec/carrier-app.md
 * §3.3, §7).
 *
 * `render(text, ctx)`: the text through `renderPaged` (src/browser/paged/
 * render.ts: settings, elements, includes from the file's record and the
 * host, page CSS, the print theme, webfonts) → the paged runtime (injected
 * into the page once: enhancement, fonts, Paged.js with the two-column
 * handler, double-buffered swap keeping the scroll position, front-matter
 * renumbering, TOC page numbers). It resolves when the pages show — after
 * at most a short wait for fonts and libraries (R.6: a slow CDN never keeps
 * the page blank; one re-flow follows when they arrive, and `idle()` waits for
 * it); a newer render supersedes an older one (its pages are never shown).
 * `present(text)`: switches the shell's deferred stylesheets on, follows the
 * header's title and theme (light paper: the chrome's scheme is light).
 *
 * The page layout (the grey desk, the pages' shadows, the reader's page zoom,
 * the print rules) is one stylesheet the view installs at run time, first in
 * `<head>` (so Paged.js' and the theme's rules win on a tie): the assembled
 * file's bytes do not depend on it.
 */
import { readDocument } from 'orz-markdown/carrier';
import type { CarrierReadView, ReadViewContext } from 'orz-markdown/carrier/app';
import type { PagedRuntime, PaginateResult } from '../../paged/runtime.js';
import { markUpdating } from '../../paged/constants.js';
import { PAGES_ID, presentationOf } from '../../presentation.js';
import { PAGED_RUNTIME } from '../runtime-source.js';
import { renderPaged } from './render.js';
import { applyZoom, type PageZoom } from './zoom.js';

/** The read view's own stylesheet (installed at run time, `#orz-paged-view-css`). */
export const VIEW_CSS = `
html { background: #e8e9ed; }
body { margin: 0; }
#orz-view { min-height: 100vh; }
#orz-view[hidden] { display: none !important; }
.orz-pages .pagedjs_pages { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 24px 0 72px; zoom: var(--orz-page-zoom, 1); }
:where(.orz-pages) .pagedjs_page { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 6px 18px rgba(0,0,0,.10); }
.orz-paged-status { font: 14px/1.5 system-ui, sans-serif; color: #5b616e; max-width: 40em; margin: 2em auto; padding: 0 1em; text-align: center; }
.orz-paged-status[hidden] { display: none; }
.orz-paged-progress { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 6; font: 12px/1.6 system-ui, sans-serif; color: #2b2f36; background: rgba(255,255,255,.92); box-shadow: 0 1px 4px rgba(0,0,0,.15); padding: 2px 12px; border-radius: 10px; pointer-events: none; }
.orz-paged-progress[hidden] { display: none; }
.orz-pages[data-orz-updating]::before { content: "updating\\2026"; position: fixed; top: 10px; left: 12px; z-index: 5; font: 12px/1.6 system-ui, sans-serif; color: #5b616e; background: rgba(255,255,255,.85); padding: 0 8px; border-radius: 9px; pointer-events: none; }
@media print {
  html, body { background: #fff !important; }
  #orz-chrome, .orz-paged-stage, .orz-paged-buffer, .orz-paged-status, .orz-paged-progress { display: none !important; }
  .orz-pages[data-orz-updating]::before { content: none !important; display: none !important; }
  /* a print from the browser's menu in edit mode: the pages, never a blank sheet (the editor does not print) */
  body > *:not(#orz-view) { display: none !important; }
  #orz-view, #orz-view[hidden] { display: block !important; min-height: 0; }
  .orz-pages .pagedjs_pages { display: block !important; gap: 0; padding: 0; zoom: 1 !important; }
  .orz-pages .pagedjs_page { box-shadow: none !important; }
}
`;

/** The paged read view: the kit's `CarrierReadView` with the pages and the reader's page zoom. */
export interface PagedReadView extends CarrierReadView {
  /** `#orz-view`, the view's root (hidden while editing). */
  readonly element: HTMLElement;
  /** `#orz-pages`, where the pages are laid out. */
  readonly pages: HTMLElement;
  render(text: string, ctx?: ReadViewContext): Promise<void>;
  /** Resolves when no render runs (Print waits for it). */
  idle(): Promise<void>;
  /** True while a render or the runtime's layout (a re-flow after late fonts included) is pending: `idle()` would wait. */
  busy(): boolean;
  /**
   * While Print waits for the layout: a quiet "Preparing pages… (n of N)" line
   * (announced; never printed), following the runtime's progress.
   */
  preparing(on: boolean): void;
  /** The last shown render (pages, the `.cols` outcomes, the dynamic choices the content uses), or null. */
  lastResult(): PaginateResult | null;
  /** The reader's page zoom (the kit stores it per uid as the reader preference `reader.pageZoom` and sets it). */
  zoom(): PageZoom;
  setZoom(zoom: PageZoom): void;
}

type RuntimeWindow = Window & { __orzPaged?: PagedRuntime };

/** The paged runtime of this page: injected once as an inline script (it runs at once). */
export function pageRuntime(doc: Document): PagedRuntime {
  const win = doc.defaultView as RuntimeWindow;
  if (!win.__orzPaged) {
    const s = doc.createElement('script');
    s.id = 'orz-paged-runtime';
    s.textContent = PAGED_RUNTIME;
    doc.head.appendChild(s);
  }
  if (!win.__orzPaged) throw new Error('orz-paged: the paged runtime did not start');
  return win.__orzPaged;
}

/** Install the read view's stylesheet once, first in `<head>`. */
function installViewCss(doc: Document): void {
  if (doc.getElementById('orz-paged-view-css')) return;
  const s = doc.createElement('style');
  s.id = 'orz-paged-view-css';
  s.textContent = VIEW_CSS;
  doc.head.prepend(s);
}

/** The read view of the shell's `#orz-view` / `#orz-pages` (created when the page lacks them). */
export function createReadView(doc: Document): PagedReadView {
  let main = doc.getElementById('orz-view');
  if (!main) {
    main = doc.createElement('main');
    main.id = 'orz-view';
    main.className = 'orz-view';
    doc.body.prepend(main);
  }
  let pages = doc.getElementById(PAGES_ID);
  if (!pages) {
    pages = doc.createElement('div');
    pages.id = PAGES_ID;
    pages.className = 'orz-pages';
    main.append(pages);
  }
  pages.setAttribute('data-orz-copy', '');
  installViewCss(doc);
  /** The quiet, announced line of the first layout ("Laying out pages…"), before the pages (it never prints). */
  let status = doc.getElementById('orz-paged-status') as HTMLElement | null;
  if (!status) {
    status = doc.createElement('p');
    status.id = 'orz-paged-status';
    status.className = 'orz-paged-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Laying out pages\u2026';
    status.hidden = true;
    pages.before(status);
  }
  const progress = doc.createElement('p');
  progress.className = 'orz-paged-progress';
  progress.setAttribute('role', 'status');
  progress.setAttribute('aria-live', 'polite');
  progress.hidden = true;
  main.append(progress);
  let progressTimer: ReturnType<typeof setInterval> | undefined;
  const showProgress = (): void => {
    const p = (doc.defaultView as RuntimeWindow).__orzPaged?.progress?.();
    const text = p && p.laid > 0 ? `Preparing pages\u2026 (${p.laid}${p.of > p.laid ? ` of ${p.of}` : ''})` : 'Preparing pages\u2026';
    if (progress.textContent !== text) progress.textContent = text;
  };
  const win = doc.defaultView as Window;
  let generation = 0;
  /** Renders started and not finished (the runtime's queue and re-flows are its own `busy()`). */
  let rendering = 0;
  let destroyed = false;
  let running: Promise<void> = Promise.resolve();
  let last: PaginateResult | null = null;
  let zoom: PageZoom = 'auto';

  const reZoom = (): void => { if (!destroyed) applyZoom(pages!, zoom); };
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onResize = (): void => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(reZoom, 100);
  };
  win.addEventListener('resize', onResize);

  // Cmd/Ctrl+P — in the read view, in edit mode, in the editor and in its preview frame (the kit's bridge reports the
  // key): the kit runs the Print action (./actions.ts), which leaves edit mode first and waits for the final layout
  // (orz-markdown 2.3.0, A.30 / E.33). A print from the browser's menu cannot wait: while the pages are still being
  // laid out the reader is told to print again (best effort; the print CSS shows the pages, never the editor)
  const app = (): { toast?(m: string, tone?: string): void } | undefined => (win as unknown as { OrzCarrier?: { standalone?: { toast?(m: string, tone?: string): void } } }).OrzCarrier?.standalone;
  const onBeforePrint = (): void => {
    if (destroyed || !view.busy()) return;
    try { app()?.toast?.('The pages are still being laid out: print again in a moment for the final layout.', 'warning'); } catch { /* no chrome */ }
  };
  win.addEventListener('beforeprint', onBeforePrint);

  /** The shell writes its stylesheets switched off (`media="not all"`, so a slow CDN never blocks the page): switch them on. */
  const enableStylesheets = (): void => {
    doc.querySelectorAll('link[rel="stylesheet"][media="not all"]').forEach((l) => l.removeAttribute('media'));
  };

  const setTitle = (text: string): void => {
    try {
      const title = readDocument(text, { kind: 'paged' }).title;
      if (doc.title !== title) doc.title = title;
    } catch { /* the title stays */ }
  };

  const present = (text: string): { scheme: 'light' } => {
    enableStylesheets();
    main!.setAttribute('data-orz-theme', presentationOf(text).theme);
    setTitle(text);
    return { scheme: 'light' };
  };

  const view: PagedReadView = {
    element: main,
    pages,
    present,
    render(text, ctx = {}) {
      const mine = ++generation;
      present(text);
      rendering++;
      // the quiet "updating…" mark (and `aria-busy`) while the pages are not the final layout of the latest text (L3)
      markUpdating(pages!, true);
      // the first layout: the fallback line ("if this page stays blank…") goes at once, a quiet, announced "Laying out
      // pages…" until the first page shows — laid out straight into view, page by page (closed loop round 3)
      if (!pages!.querySelector('.pagedjs_page')) {
        pages!.querySelectorAll('.orz-fallback').forEach((f) => f.remove());
        status.hidden = false;
      }
      const settledMark = (r: PaginateResult): void => { if (mine === generation && !destroyed && !r.provisional) markUpdating(pages!, false); };
      const run = (async () => {
        const input = await renderPaged(text, {
          ...(ctx.includes ? { includes: ctx.includes } : {}),
          ...(ctx.fetchInclude ? { fetchInclude: ctx.fetchInclude } : {}),
        });
        if (mine !== generation || destroyed) return; // a newer render won (or the view is gone)
        const result = await pageRuntime(doc).paginate(input, pages!, {
          isCurrent: () => mine === generation && !destroyed,
          // the one re-flow after late fonts or libraries (R.6): its pages are the final ones
          onReflow: (r) => { if (mine === generation && !destroyed) { last = r; reZoom(); settledMark(r); } },
          onShown: () => { status.hidden = true; reZoom(); },
        });
        if (result.cancelled) return;
        status!.hidden = true;
        last = result;
        reZoom();
        settledMark(result);
      })().finally(() => { rendering--; });
      running = run.catch(() => undefined);
      return run;
    },
    idle: async () => {
      let seen: Promise<void>;
      do {
        seen = running;
        await seen;
        // the runtime's queue and its re-flow after late fonts or libraries (Print prints the final layout)
        const w = doc.defaultView as RuntimeWindow;
        if (w.__orzPaged) await w.__orzPaged.idle();
      } while (seen !== running);
    },
    busy: () => rendering > 0 || !!(doc.defaultView as RuntimeWindow).__orzPaged?.busy(),
    preparing(on) {
      clearInterval(progressTimer);
      progressTimer = undefined;
      progress.hidden = !on;
      if (!on) return;
      showProgress();
      progressTimer = setInterval(showProgress, 250);
    },
    lastResult: () => last,
    zoom: () => zoom,
    setZoom(z) {
      zoom = z;
      reZoom();
    },
    destroy() {
      destroyed = true;
      generation++;
      win.removeEventListener('resize', onResize);
      win.removeEventListener('beforeprint', onBeforePrint);
      clearTimeout(resizeTimer);
      clearInterval(progressTimer);
      progress.remove();
    },
  };
  return view;
}
