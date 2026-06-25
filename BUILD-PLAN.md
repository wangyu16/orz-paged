# BUILD-PLAN.md — orz-paged

The module map and build order. [DESIGN.md](./DESIGN.md) is the source of truth
for *why*; this file is *what* and *in what order*. Strategy mirrors orz-slides:
**interface-first**, then leaf modules, then integration.

> Status: **not started.** This is the plan, not the state.

## Wave 0 — foundation & de-risking

- **WP0 · Interfaces + DOM/CSS contract.**
  - `src/types.ts` — `DocSettings` (the normalized `kind: document` model),
    `Element`, `TemplateDef`, `ThemeDef`, `FontPreset`, `PagedDoc`.
  - `docs/dom-contract.md` — the page DOM + CSS-variable contract shared by the
    pipeline-model output, the themes, and the editor (`@page`, `.pagedjs_page`,
    margin boxes, `.markdown-body`, the token set).
- **WP-spike · Phase-0 throwaway** (DESIGN §12): a minimal **reimplemented**
  document layer → paged.js in a static `.paged.html`; print to PDF; diff against
  orz-md-pdf's Puppeteer output. Decides the **print path** (DESIGN §7.2) and
  proves client-side pagination + CDN fonts.

## Wave 1 — leaf modules (parallel)

- **WP1 · document layer (reimplement in TS).** `src/doc/` — **reimplement**, do
  not vendor, the curated model (DESIGN §3, §8): `settings` (parse + normalize
  `{{nyml kind: document}}`), `templates` (the curated registry), `elements` (the
  curated `kind: element` → static HTML), `page-css` (settings → `@page` + margin
  boxes + counters + theme + font `<link>`). Read orz-md-pdf for behavior; write
  clean, pure, unit-tested TS.
- **WP2 · themes (light only).** `assets/themes/*.css` — a small set of light,
  print-oriented themes reconciled with orz-markdown's light set; white/light-
  colored page backgrounds. Style `.markdown-body` + page furniture per the
  dom-contract. **No dark themes.**
- **WP3 · font-preset registry (CDN).** `src/doc/fonts.ts` — map each `font_preset`
  to a CDN stylesheet URL (`@fontsource`/Google Fonts) + a `font-family` stack.
  **No bundling, no base64, no subsetting** (internet assumed, DESIGN §4).
- **WP4 · paged.js integration shim.** Thin wrapper that runs
  `Previewer.preview()` into the preview iframe, exposes re-paginate, and the
  **print path** (print the rendered `.pagedjs_page` DOM — DESIGN §7.2).

## Wave 2 — integration

- **WP5 · assembler.** `src/render-paged.ts` — Markdown → orz-markdown content →
  pipeline-model → paged HTML string + the settings needed by the runtime.
- **WP6 · browser engine.** `src/browser-entry.ts` — `window.orzpaged`: read
  `#orz-src`, run the pipeline + paged.js, expose `renderAll`/`refresh`/
  `exportPdf` for the editor. esbuild → `orz-paged-browser`.
- **WP7 · in-file editor.** `assets/app.js` — **port orz-mdhtml's `app.js`**:
  source + live paged preview (debounced re-paginate), settings-panel form,
  self-reproducing FS-Access/IndexedDB save, theme/template picker, copy-as-
  Markdown, Export-PDF, brand header.
- **WP8 · CLI + template + bundle.** `src/cli.ts`, `src/template.ts`,
  `build/bundle.ts` — the `.paged.html` shell, `--inline|--cdn`, `--new`,
  `--convert`; lockstep `orz-paged` + `orz-paged-browser`. Mirror orz-slides
  packaging.
- **WP9 · agent skill.** `orz-paged-skills/SKILL.md` — **clear and curated**:
  the curated templates/elements (DESIGN §8), page setup, the print-first content
  guidance (DESIGN §9 — discourage tabs/spoiler/youtube; light themes only), and
  export. This is a first-class deliverable, not an afterthought.

## Test strategy

- document layer + assembler: vitest (pure transforms).
- the assembled `.paged.html`: **browser-verified** — render, paginate, print
  diff, editor save. Editing/Save need Chromium.

## Ordering

WP0 → (WP-spike) → WP1–WP4 in parallel → WP5–WP8 → WP9. Don't start the editor
(WP7) before the dom-contract (WP0) and the print path (WP-spike) are locked.
