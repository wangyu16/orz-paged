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
 * renumbering, TOC page numbers). It resolves when the pages show; a newer
 * render supersedes an older one (its pages are never shown).
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
@media print {
  html, body { background: #fff !important; }
  #orz-chrome, .orz-paged-stage, .orz-paged-buffer { display: none !important; }
  #orz-view { min-height: 0; }
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
  const win = doc.defaultView as Window;
  let generation = 0;
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
      const run = (async () => {
        const input = await renderPaged(text, {
          ...(ctx.includes ? { includes: ctx.includes } : {}),
          ...(ctx.fetchInclude ? { fetchInclude: ctx.fetchInclude } : {}),
        });
        if (mine !== generation || destroyed) return; // a newer render won (or the view is gone)
        const result = await pageRuntime(doc).paginate(input, pages!, { isCurrent: () => mine === generation && !destroyed });
        if (result.cancelled) return;
        last = result;
        reZoom();
      })();
      running = run.catch(() => undefined);
      return run;
    },
    idle: async () => {
      let seen: Promise<void>;
      do {
        seen = running;
        await seen;
      } while (seen !== running);
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
      clearTimeout(resizeTimer);
    },
  };
  return view;
}
