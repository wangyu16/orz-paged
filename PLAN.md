# PLAN.md — orz-paged implementation plan

A concrete, modular build plan. Every module below is **independently
implementable and independently verifiable** (its own files + its own test), so
they can be built concurrently by separate agents. [DESIGN.md](./DESIGN.md) is the
*why*; [BUILD-PLAN.md](./BUILD-PLAN.md) is the high-level wave map; this file is
the executable decomposition.

## Progress — MVP complete and browser-verified ✅

- ✅ **Wave 0 (foundation)** — scaffold, `src/types.ts` (locked), `docs/dom-contract.md`,
  build pipeline (`tsc` + esbuild → `dist/orz-paged.browser.js`).
- ✅ **Wave 1 (pure leaves)** — 3 concurrent agents: M1 settings, M2 templates,
  M3 fonts, M5 page-css, M4 elements (`src/doc/*`).
- ✅ **Wave 2 (integration)** — M6 themes (`assets/themes/*`, 1 base + 7 light, by
  agent), A1 assembler + `src/doc/nyml.ts` (by agent), M7 paged-shim (`src/paged.ts`),
  A2 engine (`src/browser-entry.ts` — assemble → render async on a hidden stage →
  await fonts → paginate → fill TOC), A3 template (`src/template.ts` + `paged`
  brand header), A4 editor (`assets/app.js` — live re-paginate, theme picker,
  self-reproducing save), A5 CLI (`src/cli.ts`) + `build/bundle.ts` + `browser/`.
- ✅ **Wave 3 (polish)** — P1 skill (`orz-paged-skills/SKILL.md`, by agent), P2
  coherence (this file, dom-contract, status notes).

**Verification:** `tsc --noEmit` exit 0 · **vitest 125/125** · build clean · `npm run gen`
works · **browser**: `tests/sample.md` → 3 A4 pages, running header + footer page
numbers (page-n-of-N), title + abstract elements, KaTeX math, `::: page-break`,
theme; editor enter → CodeMirror → live re-paginate → theme switch → clean
self-reproducing save all confirmed.

### Authoring decision settled during build
Elements are `{{nyml kind: <element-kind>}}` directly (e.g. `kind: article-title`) —
the `kind:` value *is* the element type; `kind: document` is the settings block.

### Deferred (documented; not blocking)
- `dynamic_choices` (exam answer-key show/hide — MC answers carry `data-answer` for
  a future toggle), `pre_body_hide_header/footer` + pre-body body-counter reset,
  `page_background_effect`, `pageNumberStartPage` counter-offset — no engine/CSS hook
  yet. Smiles/chart canvases are frozen to `<img>` for the paged flow; complex
  paged.js cases (footnotes-at-page-bottom, long-table edge cases) untested.

## Principles for independence

- Every module **codes only against `src/types.ts`** (the locked interface) — never
  against another module's implementation.
- Every module owns a **disjoint file set** (no two agents touch the same file).
- Every module ships a **pure function** (or CSS) + a **self-contained test** that
  verifies it alone (`vitest run tests/<module>.test.ts`).
- Integration (Wave 2) wires the pure pieces; it's the only place modules meet.

## Dependency DAG

```
Wave 0 (foundation, sequential, owner = main)
  F1 scaffold ──► F2 types.ts ──► F3 dom-contract
        │              │
        ▼              ▼
Wave 1 (pure leaves, PARALLEL — one agent each)         all depend on F2 (+F1 to run tests)
  M1 settings      M2 templates    M3 fonts
  M4 elements      M5 page-css     M6 themes      M7 paged-shim
        └──────────────┴───────────────┴──────────────┘
                              ▼
Wave 2 (integration, mostly sequential, owner = main + targeted agents)
  A1 assembler ──► A2 browser-engine ──► A4 editor-app
        │                 ▲                   ▲
        └──► A3 template-shell ──────────────┘
  A5 cli + finalize bundle
                              ▼
Wave 3 (polish)
  P1 skill   P2 docs-coherence   P3 more themes/templates/elements
```

---

## Wave 0 — Foundation (main thread; do first, verify before fan-out)

| ID | Files | Done = verified by |
|----|-------|--------------------|
| **F1 scaffold** | `package.json`, `tsconfig.json`, `build/bundle.ts`, `build/shims/{fs.cjs,process.js,imsize.cjs}`, `vitest` (defaults), `npm install` | `tsc --noEmit` clean; `npm run build` emits `dist/orz-paged.browser.js` from a stub entry |
| **F2 types** | `src/types.ts` | `tsc --noEmit` clean; reviewed for completeness against DESIGN §6–§9 |
| **F3 dom-contract** | `docs/dom-contract.md` | review — page DOM (`@page`, `.pagedjs_page`, `.orz-page-*`, `.markdown-body`) + CSS-var token set |

Mirror orz-slides exactly (same `package.json` scripts, `tsconfig`, esbuild
`bundle.ts` + shims; swap `reveal.js` → `pagedjs`). Dependencies:
`orz-markdown` from npm (`^1.3.2`, currently resolving to 1.3.2+) + `pagedjs`.

---

## Wave 1 — Pure leaf modules (PARALLEL — one subagent each)

Each: code against `src/types.ts`, write the module + a vitest spec, verify
`vitest run tests/<m>.test.ts` green. Behavior reference: `docs/document-model.md`
and `docs/supported-features.md` (a **spec to reimplement cleanly**, not copy).

| ID | Owns | Interface (from types.ts) | Independent test |
|----|------|---------------------------|------------------|
| **M1 settings** | `src/doc/settings.ts` | `parseDocSettings(src): RawDocSettings`; `normalizeSettings(raw): DocSettings`; `mergeSettings(...layers): DocSettings` | aliases normalize (`a4`→`A4`), defaults fill, later layer wins, page-number style/position parse |
| **M2 templates** | `src/doc/templates.ts` | `TEMPLATES: Record<TemplateName, Partial<DocSettings>>`; `resolveTemplate(name): Partial<DocSettings>` | each of `article/report/letter/cv/note/exam` returns expected page/font/theme defaults |
| **M3 fonts** | `src/doc/fonts.ts` | `fontPreset(name): { cssUrl: string; family: string }` | each preset → a CDN stylesheet URL + a non-empty family stack; unknown → system fallback |
| **M4 elements** | `src/doc/elements.ts` | `renderElement(spec: ElementSpec, ctx: ElementCtx): ElementResult` | `article-title`(placement page/section), `abstract`, `letterhead`, `toc`, `cv-header`, `question-mc/open`, `timestamp` → expected HTML + scoped CSS; `placement:page` adds `break-after:page` |
| **M5 page-css** | `src/doc/page-css.ts` | `buildPageCss(s: DocSettings): string` | `@page { size; margin }`, margin-box `content` per page-number position/style, header/footer rules, layout-behavior CSS (image fit, table header repeat, row-break) |
| **M6 themes** | `assets/themes/{base.css, article.css, …}` (light only) | (CSS, styles the dom-contract) | renders sample `.markdown-body` content; light bg; no dark rules; lints |
| **M7 paged-shim** | `src/paged.ts` | `paginate(html, opts): Promise<void>` (run `Previewer.preview` into a target), `printPaged()` | unit: module imports `pagedjs` `Previewer` and exposes the API (browser-verified later) |

Notes for agents:
- **M4 elements** receives an injected inline/block Markdown renderer in `ctx`
  (so it doesn't hard-depend on orz-markdown); keep element HTML semantic + add a
  *scoped* `<style>` once per element kind. **No interactive constructs.**
- **M1/M2/M5** are decoupled by the `DocSettings` type: M1 normalizes, M2 supplies
  template layers to merge, M5 consumes the merged result. None imports another's
  code in a way that blocks parallel dev (M2/M3 are data + a getter).
- **M6/M7** have no TS dependency on M1–M5.

---

## Wave 2 — Integration (main thread; A3 parallelizable)

| ID | Owns | Depends | Done = |
|----|------|---------|--------|
| **A1 assembler** | `src/render-paged.ts` — Markdown → orz-markdown content + M4 elements + M1/M2 settings + M5 page-css → `{ pageHtml, settings }` | M1–M5 | vitest: a sample → expected `<style>` + content + element HTML |
| **A2 browser-engine** | `src/browser-entry.ts` — `window.orzpaged`: read `#orz-src`, assemble, draw async content, **await fonts+diagrams**, run M7 paginate, expose `renderAll/refresh/exportPdf` | A1, M7 | browser: sample paginates into `.pagedjs_page`; print preview matches |
| **A3 template-shell** | `src/template.ts` — the `.paged.html` shell + editor chrome + **brand header (orz seal + `paged` + GitHub → wangyu16/orz-paged)** + `#orz-src` | F3 | a generated file opens + renders |
| **A4 editor-app** | `assets/app.js` — port mdhtml: source + live paged preview (debounced), settings-panel form, FS-Access save, copy-as-Markdown, Export-PDF | A2 API, A3 ids | browser: edit→repaginate, save round-trips |
| **A5 cli+bundle** | `src/cli.ts`, finalize `build/bundle.ts` | A1, A3 | `npm run gen -- sample.md` writes a working `.paged.html` |

The **async-before-paginate sequencing** (DESIGN §6) lives in A2 and is the single
biggest correctness risk — verify it explicitly (diagrams + `document.fonts.ready`
before `paginate()`, re-paginate on late resize).

---

## Wave 3 — Polish

| ID | Owns |
|----|------|
| **P1 skill** | `orz-paged-skills/SKILL.md` — curated, template-first, print-first content guidance (DESIGN §8–§9) |
| **P2 coherence** | README/DESIGN/CLAUDE sync; `docs/dom-contract.md` final |
| **P3 breadth** | more templates/elements/themes as demand shows; exam dynamic-switch UI |

---

## Verification ladder (per module → whole)

1. **Unit** (Wave 1, A1): `vitest run tests/<m>.test.ts` — pure transforms.
2. **Build**: `npm run build` — `tsc` + esbuild bundle clean.
3. **Render**: `npm run gen -- tests/<sample>.md` → a `.paged.html`.
4. **Browser** (A2/A4): preview server — paginates, prints faithfully, editor
   saves. Chromium for editing/Save.
5. **Print diff**: compare the printed PDF to orz-md-pdf's Puppeteer output on the
   same source — "no noticeable difference" is the bar.

## Concurrency policy for agents

- Each Wave-1 agent **writes only its owned files** and **runs only its own test**
  (`vitest run tests/<m>.test.ts`) — not the whole suite (other modules may be
  in flight).
- No agent edits `src/types.ts`, `package.json`, or another module's files. If a
  type gap is found, report it back; main thread amends `types.ts`.
