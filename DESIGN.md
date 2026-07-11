# DESIGN.md — orz-paged

**Source of truth for the orz-paged project.** This document initiates the
design; `BUILD-PLAN.md` is the module map and build order.

> Status: **published and browser-verified** (`orz-paged` + `orz-paged-browser` v0.6.1). Markdown
> → `.paged.html` → paged.js pagination → editor → print all work, plus 12
> templates, 7 vendored themes, rich title/author elements, exam questions with a
> dynamic answer-key switch, and an in-file template picker. This document remains
> the source of truth for *why*; see `README.md` for current usage.

---

## 1. Vision

`orz-paged` turns a Markdown source into a single, self-contained, **editable**
`.paged.html` — one portable file that, in any browser, shows the document as a
sequence of **print pages on light-colored paper** (A4/Letter, real margins,
running headers/footers, page numbers), can be **edited and saved in-browser**,
and **exports to PDF by printing** — with no noticeable difference from the
on-screen pages.

It is the **paginated-document sibling** of:
- [orz-mdhtml](../orz-mdhtml) — a continuous document (`.md.html`),
- [orz-slides](../orz-slides) — a reveal.js deck (`.slides.html`),

sharing their philosophy (single editable file, in-browser editor, FS-Access
save, copy-as-Markdown, lockstep CDN packaging) and their renderer
([orz-markdown](../orz-markdown)).

### What it is NOT

- **Not a `.md.pdf`.** The `orz-md-pdf` VS Code extension makes a PDF binary with
  the Markdown embedded, rendered by Puppeteer. orz-paged keeps the artifact an
  **editable HTML file in a paged view**; a PDF is produced only on demand, by the
  browser's print engine. No PDF binary, no Puppeteer, no VS Code.
- **Not a screen app.** It mimics **print on paper**: light backgrounds only, no
  dark mode, no interactive/dynamic constructs (see §9).

### Why this is feasible

`orz-md-pdf` proves the rendering chain works: Markdown + a settings block →
print-accurate **paged.js HTML** (page config, running margin boxes, page
numbers, document elements, templates, themes). orz-paged keeps that *model* but
(a) **reimplements the document layer in TypeScript** consistent with the family
(see §3), and (b) replaces Puppeteer with the browser's own
`Ctrl/Cmd+P → Save as PDF`. Because the on-screen pages are real paged.js pages
governed by `@page` rules, print fidelity is inherent.

---

## 2. The family, and the renderer

```
orz-markdown  (= @orz-how/markdown-parser — same package, repo wangyu16/orz-markdown)
   │  {{…}} plugins, ::: containers, {{nyml}}, KaTeX
   ├── orz-mdhtml  → .md.html     (continuous document)
   ├── orz-slides  → .slides.html (reveal.js deck)
   └── orz-paged   → .paged.html  (paged.js paginated document)   ← THIS PROJECT
```

orz-paged depends on **`orz-markdown`** exactly like its siblings
(`^1.4.1` from npm). It is a **host app that brings
its own CSS + shell**, so it follows
`../orz-markdown/orz-markdown-skills/references/embedding.md`.

---

## 3. Architecture — borrow the *model*, not the *code*

The user's guidance: orz-md-pdf works but is **not extensively tested**, and its
authoring model is **comprehensive but complex**. So:

> **orz-md-pdf is a *specification* reference, not a code dependency.** orz-paged
> **reimplements** the document layer in TypeScript — consistent with
> orz-mdhtml/orz-slides — taking a **curated subset** of the model. We do not
> vendor its (untested, CommonJS) `pipeline-model` source.

This avoids inheriting untested code and lets us drop complexity that doesn't earn
its place. The spec lives in `docs/document-model.md` and
`docs/supported-features.md` (copied from orz-md-pdf for reference); orz-paged
implements the **curated** parts of it (§7, §8).

### Layered design (all TypeScript, all client-capable)

| Layer | What | Reuse |
|---|---|---|
| **parse + content** | `orz-markdown` renders the prose | dependency (as-is) |
| **document settings** | read one `{{nyml kind: document}}` block → a normalized `DocSettings` | reuse orz-markdown's existing `{{nyml}}` (it already emits invisible JSON) |
| **elements** | a small registry: concrete `kind:` values such as `article-title`, `toc`, and `question-mc` → static HTML | reimplement *curated* set (§8) |
| **paged HTML** | settings + content → page CSS (`@page`, margin boxes, page numbers) + theme + font links | new, TS |
| **pagination** | paged.js flows it into `.pagedjs_page` boxes | dependency (as-is) |
| **shell + editor** | the `.paged.html` file, in-file editor, save, copy | **port orz-mdhtml** |
| **PDF** | `window.print()` + `@page` | the browser |

Keeping each layer a **pure transform** (settings → CSS string, content → element
HTML) makes them unit-testable, like orz-slides' parser/layout/assembler.

---

## 4. Delivery & the internet assumption

**Assume internet is available at view/edit/print time** (same as orz-slides). This
removes the hardest problem orz-md-pdf solved by bundling — fonts:

- **Fonts come from a CDN** (`@fontsource` / Google Fonts `<link>`), always. **No
  base64 embedding, no subsetting.** The chosen `font_preset` maps to a CDN
  stylesheet URL + a `font-family` stack. (This is the single biggest
  simplification vs. orz-md-pdf, and it keeps `.paged.html` files small.)
- **Web images** load by URL; **KaTeX / Mermaid / SmilesDrawer / Chart.js** load
  from CDN at view time, exactly as in orz-slides.
- **Engine + theme:** `--inline` (default) embeds the `orz-paged-browser` engine
  bundle + paged.js + the active theme CSS (so the document renders without
  network); `--cdn` references jsDelivr for those too. Either way, **fonts/images/
  libs are CDN**.

Two npm packages, **lockstep-versioned** like orz-slides:
- **`orz-paged`** — the CLI/generator.
- **`orz-paged-browser`** — the esbuild engine bundle (`orz-markdown` + the
  document layer + paged.js + assembler/runtime), served via jsDelivr.

---

## 5. The file model (`.paged.html`)

Mirrors mdhtml/slides exactly:

- **Single source of truth** — the Markdown lives in a
  `<script type="text/markdown" id="orz-src">`; the engine renders it on load; the
  editor re-serialises it on save (**self-reproducing**).
- **Document-first** — opens showing the paginated document; a small edit
  affordance reveals the editor (libs lazy-load on first edit), like orz-mdhtml.
- **Valid standalone HTML** — presents/prints in any modern browser; editing +
  Save need a Chromium-based browser (FS-Access API).

---

## 6. Rendering pipeline (in the browser)

```
 #orz-src (Markdown)
   │  read {{nyml kind: document}}  →  DocSettings (+ template defaults, merged)
   │  orz-markdown.render(body)     →  content HTML  ({{…}}, :::, KaTeX, mermaid…)
   │  processElements               →  concrete element kind → static HTML
   │  buildPageCss(settings)        →  @page size/margins, margin boxes, counters, theme, font <link>
   │  paged.js Previewer.preview()  →  .pagedjs_page boxes   (the visible pages)
   ▼
 paginated document  (the same DOM prints to PDF)
```

Re-pagination (paged.js re-flows the whole document) is the cost center; the
editor **debounces** it (~0.5 s after typing stops) and renders into an **isolated
preview iframe** (§10).

### Critical sequencing (a correctness risk, not just perf)

Pagination depends on **final element heights**, but KaTeX, Mermaid, SmilesDrawer,
and Chart.js render **asynchronously** and change heights after the initial DOM is
in place (the same lag orz-slides hits with diagram fit — but worse here, because
a wrong height mis-paginates the *whole document*). So the engine must:

```
render markdown → draw math/mermaid/smiles/chart → AWAIT their completion → THEN run paged.js
```

Never paginate before async content settles, and re-paginate if a late diagram
resizes. Web fonts add the same hazard: wait for `document.fonts.ready` (CDN
fonts) before pagination, or pages reflow after the font swaps. The Phase-0 spike
must prove this ordering end to end.

---

## 7. Resolved decisions (was "open questions")

The user asked for the best options. Decisions:

1. **Document layer = reimplement in TS** (not vendor orz-md-pdf's JS). §3.
2. **Print path = print the paged.js page DOM** (Option A — WYSIWYG): the
   on-screen `.pagedjs_page` boxes are what print, via paged.js's print CSS mapping
   each box to one physical `@page`. Simplest and truest; revisit only if a
   browser mispaginates.
3. **Preview isolation = iframe** (consistent with orz-mdhtml) — keeps paged.js's
   global page CSS off the editor chrome.
4. **Fonts = CDN, no embedding** (internet assumed). §4.
5. **Themes = light only.** White or light-colored ("paper") backgrounds, mimicking
   print. **No dark mode.** A small curated set (§8). The *editor chrome* follows
   the family convention (its own dark toolbar, like slides) — independent of the
   always-light document.
6. **Page break = the arbitrary-class container `::: page-break`** — **no new
   plugin, no orz-markdown change.** orz-markdown already turns any `::: ClassName`
   into `<div class="ClassName">` (verified, including an *empty* one), so the
   paged theme just styles `.page-break { break-before: page }`. It round-trips
   through copy-as-Markdown via the container-promotion already in the runtime.
   Simpler than a `{{pagebreak}}` plugin or orz-md-pdf's `{{nyml page-break}}`.
7. **Re-pagination = debounced full re-flow** for v1 (fast enough for typical
   docs); incremental is a later optimization.
8. **Parser dependency = `orz-markdown`** (`file:` dep), like the rest of the
   family.

---

## 8. Curated scope — templates, themes, elements

### Two-tier UX (the guiding principle)

> **Template-first.** A normal user touches **one knob — the template** — and gets
> a complete, good-looking document. **Power users and AI agents** can then tailor
> far more: every `kind: document` setting (page, margins, fonts, headers/footers,
> page numbers, decoration color, `custom_css`) and any element remain available
> and overridable. The template only sets *defaults*.

So the engine implements the **full document-settings model** (it's cheap and
powerful) plus a **curated, extensible element set**; the **agent skill teaches
the templates first**, with settings/elements as the advanced layer. orz-md-pdf's
heavier bits (custom `define-element`, sidebar running-elements) are deferred, not
promised.

### Templates (the starter set — most common document kinds)

| Template | For | Defaults (page · body font · headings) |
|---|---|---|
| `article` | academic paper / short report | Letter · serif · same — title (page or section) + `abstract` |
| `report` | business / technical report | Letter · sans · sans — title (page or section) + header/footer + optional `toc` |
| `letter` | formal letter | Letter · serif — `letterhead` + inside-address + signature |
| `cv` | résumé (one good layout, not five) | Letter · sans — `cv-header` |
| `note` | clean readable notes | A4 · serif — minimal furniture |
| `exam` | exam / assessment | Letter · serif — title (page or section), `question-*`, answer-key toggle |

(`book`/thesis and the multiple CV variants are deferred to a later phase.)

### Title: dedicated page **or** inline section (article · report · exam)

Each of `article`, `report`, and `exam` provides a **title element with a
`placement` option**:
- `placement: page` — a **dedicated title/cover page** (`break-after: page`; on a
  `pre-body` page the body page-counter starts at 1).
- `placement: section` *(default)* — an **inline title section**: title block at
  the top, content flows on the **same page** below it.

One element per template (`article-title`, `report-title`, `exam-title`) carrying
the shared placement toggle — rather than orz-md-pdf's separate
`*-title-page` vs `*-title-section` pair.

### Themes (light only)

A handful of **light, print-oriented** themes reconciled with orz-markdown's
existing light set (`light-academic-*`, `light-neat-*`, `beige-decent-*`). Each
sets a white or light-colored page background and print-appropriate typography.
**No dark themes.** `theme: none` = plain.

### Elements (curated)

`article-title` / `report-title` / `exam-title` (each with
`placement: page | section`), `abstract`, `letterhead`, `letter-inside-address`,
`letter-signature`, `toc`, `cv-header`, `question-mc`, `question-open`,
`timestamp`. **Deferred:** thesis title page, the extra letterhead/CV variants,
`cv-sidebar-layout` (paged.js running element), `define-element`.
**Dynamic-switch** (answer-key show/hide) is kept *only* for `exam` because it's
that template's core value; not a general feature.

---

## 9. Content guidance — print-first (in the skill)

A `.paged.html` mimics paper, so the skill steers authors toward **static,
printable** constructs and away from screen-only ones:

- **Recommended:** headings, lists, tables, blockquotes, code, **math (KaTeX)**,
  **mermaid**, **smiles**, **`{{chart}}`**, **`{{qr}}`** (a printed QR is useful),
  images, footnotes, `{{toc}}`, admonitions (`::: info/success/warning/danger`),
  columns (`:::: cols`), and the document elements (§8).
- **Discouraged** (same as orz-md-pdf): **tabs**, **spoiler** (`::: spoil`),
  **youtube** — they hide content or are video, meaningless on paper. The skill
  tells authors not to use them in paged documents.
- **No dark themes / dark backgrounds.**

These are guidance, not hard blocks (orz-markdown still renders them), but the
skill and templates won't use them.

---

## 10. In-file editor (ported from orz-mdhtml)

Document-first, like mdhtml:

- **Layout:** CodeMirror source on one side, the **live paged preview** (an iframe
  running paged.js) on the other; split / editor / preview view modes.
- **Live update:** debounced re-render + re-paginate ~0.5 s after typing stops,
  preserving scroll — orz-md-pdf already solves the no-flash update.
- **Settings panel:** edit the `kind: document` block via a form (page size,
  margins, font preset, page-number position/style, header/footer text, theme,
  template), written back into the source.
- **Save:** self-reproducing FS-Access (`Ctrl/Cmd+S`) + IndexedDB handle +
  download fallback + served-page notice — **ported verbatim from mdhtml**.
- **Copy-as-Markdown:** embed `orz-markdown`'s `getBrowserRuntimeScript()`
  (selection in the pages → Markdown source); follow the embedding guide.
- **Export PDF** button (`window.print()`) and a **brand header** in the editor
  toolbar — the **orz seal logo + the wordmark `paged` + a GitHub link** to
  `https://github.com/wangyu16/orz-paged` — reusing the exact logo SVG and markup
  added to orz-slides/orz-mdhtml (the green `orz` seal carries "orz", so the text
  is just the variant: `paged`).

---

## 11. Consistency checklist with mdhtml / slides

- TypeScript + ESM; pure transforms unit-tested with vitest; the assembled file
  browser-verified.
- `dist/` and the `*-browser` bundle **gitignored** (regenerated on build), like
  orz-slides; two packages bumped in lockstep; publish `*-browser` first.
- `--inline` (default) / `--cdn`; jsDelivr; version check; served-page notice.
- The single-source-of-truth `<script type="text/markdown">` + self-reproducing
  save; the ported editor/save/copy stack; the brand header.
- `docs/dom-contract.md` *(to write)* locks the page DOM + CSS-variable contract
  shared by the document layer, the themes, and the editor.
- Network note: prefix npm/git with
  `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"`.

---

## 12. Phased roadmap

- **Phase 0 — spike (throwaway):** one sample → (reimplemented, minimal) document
  layer → paged.js → static `.paged.html` in the browser; **print to PDF** and
  diff against orz-md-pdf's Puppeteer PDF. Validates client-side pagination + the
  print path + CDN fonts.
- **Phase 1 — MVP:** the `.paged.html` shell + engine (`orz-markdown` + document
  layer + paged.js); document-first render; the ported in-file editor (source +
  live paged preview); FS-Access save; `kind: document` settings; 2 light themes +
  a few CDN font presets; the `article` template (with title page/section);
  `::: page-break`; Export-PDF; the brand header.
- **Phase 2:** the curated templates + elements (§8); the settings-panel form;
  copy-as-Markdown; convert-`.md` + new-from-template; lockstep browser bundle +
  CLI + npm; **the agent skill** (clear, curated) + CLAUDE.md coherence.
- **Phase 3:** incremental re-pagination; exam dynamic-switch UI; more themes/
  templates as demand shows; optional cross-tool round-trip with `.md.pdf`.

---

## 13. References

- `docs/document-model.md`, `docs/supported-features.md` — orz-md-pdf's model,
  **as a spec reference** (orz-paged curates + reimplements; does not depend on it).
- `../orz-md-pdf-vscode` + the local `.vsix` — the reference implementation to read
  for behavior, **not to copy** (untested; CommonJS).
- `../orz-mdhtml` — the editable-file architecture to port (template, `app.js`,
  save, copy).
- `../orz-slides` — lockstep packaging, the dom-contract pattern, CDN-at-view-time.
- `../orz-markdown/orz-markdown-skills/references/embedding.md` — the host-CSS +
  runtime + copy-as-Markdown contract this project must follow.
- `../paged2` — an earlier paged.js editor prototype (settings panel, page config).
