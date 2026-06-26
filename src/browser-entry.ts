/**
 * Browser entry for orz-paged — the in-file paged-document engine (A2).
 *
 * esbuild bundles this (+ orz-markdown, paged.js, the document layer and
 * assembler) into `dist/orz-paged.browser.js`, exposing `window.orzpaged`.
 *
 * Flow (DESIGN §6 — the critical sequencing): read the embedded Markdown →
 * `assemble()` it → render async content (mermaid/smiles/chart) on a hidden
 * stage and **await it + `document.fonts.ready`** (pagination depends on final
 * heights) → paginate with paged.js into `.orz-pages` → fill TOC page numbers.
 * Export = the browser's own print.
 */
import { assemble } from './render-paged.js';
import { paginate, printDocument, type PagedStylesheet } from './paged.js';
import type { PagedAssembly } from './types.js';

const VERSION = typeof __ORZPAGED_VERSION__ !== 'undefined' ? __ORZPAGED_VERSION__ : '0.0.0';

/* ---------- config (provided by the template) ---------- */

interface OrzPagedConfig {
  mode?: 'inline' | 'cdn';
  /** inline: base.css text; cdn: ignored. */
  baseCss?: string;
  /** inline: themeName → css text. */
  themes?: Record<string, string>;
  /** cdn: base.css URL. */
  baseUrl?: string;
  /** cdn: themeName → css URL. */
  themeUrls?: Record<string, string>;
  /** KaTeX stylesheet URL (math is pre-rendered; this styles it). */
  katexCss?: string;
  /** highlight.js stylesheet URL (light/github — paged is light-only). */
  hljsCss?: string;
  /** CDN URLs for the client-rendered enhancers, loaded only if used. */
  enhancers?: { mermaidJs?: string; smilesJs?: string; chartJs?: string; hljsJs?: string };
}

function cfg(): OrzPagedConfig {
  return (window as unknown as { __ORZ_PAGED__?: OrzPagedConfig }).__ORZ_PAGED__ || {};
}

/* ---------- helpers ---------- */

function sourceText(): string {
  const el = document.getElementById('orz-src');
  return (el ? el.textContent || '' : '').replace(/^\n/, '').replace(/\n\s*$/, '');
}

function pagesContainer(): HTMLElement {
  let el = document.getElementById('orz-pages');
  if (!el) {
    el = document.createElement('div');
    el.id = 'orz-pages';
    // paged.js reflows the .markdown-body content into page boxes, dropping that
    // wrapper; mark the container so the orz runtime's copy-as-Markdown handler
    // still fires for a selection in the rendered pages.
    el.setAttribute('data-orz-copy', '');
    document.body.appendChild(el);
  }
  return el;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!src) return resolve();
    if (document.querySelector(`script[data-lib="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.setAttribute('data-lib', src);
    s.setAttribute('data-orz-runtime', '1'); // stripped before save (self-reproducing)
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}

function ensureLink(href: string, id?: string): void {
  if (!href) return;
  if (id && document.getElementById(id)) return;
  if (!id && document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  if (id) l.id = id;
  l.setAttribute('data-orz-runtime', '1'); // stripped before save (self-reproducing)
  document.head.appendChild(l);
}

/** Turn a drawn <canvas> into an <img> so it survives HTML serialization for paged.js. */
function canvasToImg(canvas: HTMLCanvasElement): void {
  try {
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    img.className = canvas.className;
    img.style.maxWidth = '100%';
    const dm = canvas.getAttribute('data-md');
    if (dm != null) img.setAttribute('data-md', dm); // preserve copy-as-Markdown breadcrumb
    canvas.replaceWith(img);
  } catch { /* tainted/empty canvas — leave as-is */ }
}

/** Load (on demand) and run mermaid / smiles / chart on `root`, then settle to static HTML. */
async function renderEnhancers(root: HTMLElement): Promise<void> {
  const e = cfg().enhancers || {};
  const w = window as Record<string, any>;
  const jobs: Promise<unknown>[] = [];

  // Syntax-highlight code on the stage before pagination, so the highlighted
  // markup flows into the pages (and prints).
  if (e.hljsJs && root.querySelector('pre code')) {
    await loadScript(e.hljsJs);
    if (w.hljs) {
      root.querySelectorAll<HTMLElement>('pre code:not(.hljs)').forEach((b) => {
        try { w.hljs.highlightElement(b); } catch { /* ignore */ }
      });
    }
  }

  if (e.mermaidJs && root.querySelector('.mermaid')) {
    await loadScript(e.mermaidJs);
    if (w.mermaid) {
      w.mermaid.initialize({ startOnLoad: false });
      jobs.push(Promise.resolve(w.mermaid.run({ nodes: root.querySelectorAll('.mermaid') })).catch(() => undefined));
    }
  }
  if (e.smilesJs && root.querySelector('canvas[data-smiles]')) {
    await loadScript(e.smilesJs);
    if (w.SmilesDrawer) {
      root.querySelectorAll<HTMLCanvasElement>('canvas[data-smiles]').forEach((c) => {
        const drawer = new w.SmilesDrawer.Drawer({ width: c.width, height: c.height });
        jobs.push(new Promise<void>((res) => {
          w.SmilesDrawer.parse(c.getAttribute('data-smiles'), (tree: unknown) => {
            try { drawer.draw(tree, c, 'light', false); } catch { /* ignore */ }
            res();
          }, () => res());
        }));
      });
    }
  }
  if (e.chartJs && root.querySelector('canvas.orz-chart[data-chart]')) {
    await loadScript(e.chartJs);
    if (w.Chart) {
      root.querySelectorAll<HTMLCanvasElement>('canvas.orz-chart[data-chart]').forEach((c) => {
        try {
          const conf = JSON.parse(c.getAttribute('data-chart') || '{}');
          conf.options = { ...(conf.options || {}), responsive: false, animation: false };
          new w.Chart(c, conf);
        } catch { /* ignore */ }
      });
    }
  }

  await Promise.all(jobs);
  // Freeze canvases (smiles/chart) to images so paginating from innerHTML keeps them.
  root.querySelectorAll('canvas').forEach((c) => canvasToImg(c as HTMLCanvasElement));
}

/* ---------- render ---------- */

let lastAssembly: PagedAssembly | null = null;
let themeOverride: string | null = null; // editor theme picker; null = the document's theme

function stylesheetsFor(a: PagedAssembly): PagedStylesheet[] {
  const c = cfg();
  const theme = themeOverride || a.theme;
  const sheets: PagedStylesheet[] = [];
  if (c.mode === 'cdn') {
    if (c.baseUrl) sheets.push(c.baseUrl);
    if (theme !== 'none' && c.themeUrls && c.themeUrls[theme]) sheets.push(c.themeUrls[theme]);
  } else {
    if (c.baseCss) sheets.push({ 'orz-base.css': c.baseCss });
    if (theme !== 'none' && c.themes && c.themes[theme]) sheets.push({ 'orz-theme.css': c.themes[theme] });
  }
  // NOTE: do NOT push KaTeX (a URL) here — paged.js' polisher would XHR-fetch it,
  // which file:// blocks (cross-origin from an opaque origin), breaking pagination
  // offline. KaTeX is loaded as a <head> <link> in render(), which styles the
  // .pagedjs_page math globally — no fetch needed. (In --inline mode every entry
  // below is inline CSS, so pagination needs no network at all.)
  sheets.push({ 'orz-page.css': a.css }); // @page rules + element CSS — last so it wins
  return sheets;
}

/** Assemble `source`, render async content, and paginate into `.orz-pages`. */
async function render(source: string): Promise<void> {
  const a = assemble(source);
  lastAssembly = a;

  // Stylesheets the document needs in <head> for fonts + math (and staging measurement).
  a.fontCssUrls.forEach((u) => ensureLink(u));
  if (cfg().katexCss) ensureLink(cfg().katexCss!, 'orz-katex');
  if (cfg().hljsCss) ensureLink(cfg().hljsCss!, 'orz-hljs');

  // Stage off-screen so diagrams render (and get real sizes) before pagination.
  const stage = document.createElement('div');
  stage.className = 'orz-stage';
  stage.style.cssText = 'position:absolute;left:-99999px;top:0;width:680px;';
  stage.innerHTML = a.bodyHtml;
  document.body.appendChild(stage);

  // Double-buffer: paginate into an off-screen container, then swap it in. The old
  // pages stay visible until the swap, so a re-render never flashes to the top —
  // and we restore the scroll position across the swap.
  const out = document.createElement('div');
  out.style.cssText = 'position:absolute;left:-99999px;top:0;width:900px;';
  document.body.appendChild(out);
  try {
    await renderEnhancers((stage.querySelector('.orz-doc') as HTMLElement) || stage);
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
    await paginate(stage.innerHTML, stylesheetsFor(a), out);

    const pages = pagesContainer();
    const prevScroll = pages.scrollTop;
    pages.replaceChildren(...Array.prototype.slice.call(out.childNodes));
    pages.scrollTop = prevScroll;
    fillToc();
    // let the editor re-fit the preview zoom to the pane (it owns the layout)
    const hook = (window as unknown as { __orzPagedAfterRender?: () => void }).__orzPagedAfterRender;
    if (hook) { try { hook(); } catch { /* ignore */ } }
  } finally {
    stage.remove();
    out.remove();
  }
}

/** After pagination, fill `.orz-toc` placeholders with heading links + page numbers. */
function fillToc(): void {
  const pages = pagesContainer();
  const tocNav = pages.querySelector('.orz-toc');
  if (!tocNav) return;
  const maxLevel = Number(tocNav.getAttribute('data-max-level') || '3');
  const items: string[] = [];
  pages.querySelectorAll<HTMLElement>('.pagedjs_page h1, .pagedjs_page h2, .pagedjs_page h3, .pagedjs_page h4').forEach((h) => {
    const level = Number(h.tagName.slice(1));
    if (level > maxLevel) return;
    const page = h.closest('.pagedjs_page') as HTMLElement | null;
    const pageNum = page ? page.getAttribute('data-page-number') || '' : '';
    items.push(
      `<li class="orz-toc-item orz-toc-l${level}"><span class="orz-toc-text">${h.textContent || ''}</span>` +
      `<span class="orz-toc-page">${pageNum}</span></li>`,
    );
  });
  if (items.length) tocNav.innerHTML = `<ol class="orz-toc-list">${items.join('')}</ol>`;
}

/* ---------- public API ---------- */

const api = {
  version: VERSION,
  assemble,
  /** Re-render from a (possibly edited) source. */
  render: (source: string) => render(source),
  /** Re-render from the embedded source. */
  refresh: () => render(sourceText()),
  /** Export to PDF via browser print. */
  exportPdf: () => printDocument(),
  /** Force a theme (editor picker); '' / 'none' clears the override. */
  setTheme: (id: string) => { themeOverride = id && id !== 'none' ? id : null; return render(sourceText()); },
  /** The last assembly (resolved settings etc.) for the editor's settings panel. */
  get assembly() { return lastAssembly; },
  /** Read the embedded source. */
  source: sourceText,
};

(window as unknown as { orzpaged: typeof api }).orzpaged = api;

function boot(): void { render(sourceText()).catch((err) => console.error('[orz-paged]', err)); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
