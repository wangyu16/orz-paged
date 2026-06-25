# CLAUDE.md — orz-paged

Guidance for AI agents working in this repository.

## What this is

`orz-paged` generates a single, self-contained, **editable** `.paged.html` — a
Markdown document shown as **print pages** in any browser (via
[paged.js](https://pagedjs.org/)), edited and saved in-browser, and exported to
PDF by **printing** (no Puppeteer, no PDF binary). It is the paginated-document
sibling of [orz-mdhtml](../orz-mdhtml) and [orz-slides](../orz-slides), authored
in [orz-markdown](../orz-markdown).

**[DESIGN.md](./DESIGN.md) is the source of truth.** Read it first.

> **Status: MVP built and browser-verified.** The full pipeline works (generate →
> paginate → edit → print); `tsc` clean, vitest 90/90. See `PLAN.md` for module
> status and deferred items. `npm run build` then `npm run gen -- tests/sample.md`.

## The big idea (don't re-derive it)

The **`orz-md-pdf`** VS Code extension (`../orz-md-pdf-vscode`, local `.vsix`)
proves the rendering chain: Markdown + a `{{nyml kind: document}}` block →
print-accurate **paged.js HTML**. orz-paged keeps that *model* but:

1. **reimplements the document layer in TypeScript** — orz-md-pdf is a
   **specification reference, NOT a code dependency**. Its `pipeline-model` is
   plain CommonJS and **not extensively tested**; do not vendor it. Read it for
   behavior, reimplement cleanly, and ship only a **curated subset** (DESIGN §8).
2. **runs paged.js in the browser** to paginate (into an isolated preview iframe),
3. **wraps it in the orz-mdhtml editable-file architecture** (single source-of-
   truth `.paged.html`, in-file CodeMirror editor, FS-Access save, copy-as-
   Markdown), and
4. **exports PDF via `window.print()`** — no Puppeteer, no PDF binary.

`@orz-how/markdown-parser` and `orz-markdown` are the **same package**
(repo `wangyu16/orz-markdown`); orz-paged depends on `orz-markdown`.

## Non-negotiable constraints (from the project owner)

- **Assume internet** at view/edit/print time (like orz-slides): **fonts, web
  images, and the math/diagram libs all load from CDN.** No font embedding or
  subsetting. `--inline` embeds the engine + theme only.
- **Light themes only** — white or light-colored "paper" backgrounds. **No dark
  mode** for the document. (The editor chrome may still be dark.)
- **Print-first content** — the skill discourages screen-only constructs (**tabs,
  spoiler, youtube**); favors static ones (math, mermaid, smiles, chart, qr,
  images, footnotes, toc, admonitions, columns).
- **Curated + clear** — ship a small set of common templates/elements and a clear
  agent skill, not orz-md-pdf's full registry.
- **Template-first** — a normal user picks **one knob (the template)** and is
  done; power users and AI agents can override any `kind: document` setting and
  add elements. The template sets defaults only (DESIGN §8). `article`/`report`/
  `exam` each offer a title as a **dedicated page or an inline section**
  (`placement: page | section`).

## Spec references (read; don't copy verbatim)

- `docs/document-model.md`, `docs/supported-features.md` — orz-md-pdf's model, as
  a **spec to curate from**. orz-paged reimplements the curated parts; it does not
  adopt the whole thing or depend on its code.

## Conventions to mirror (from the siblings)

- **Two lockstep npm packages:** `orz-paged` (CLI) + `orz-paged-browser` (esbuild
  engine bundle). jsDelivr for `--cdn`. Bump both together.
- **`--inline` (default)** embeds engine + paged.js + theme + the document's
  fonts; **`--cdn`** references jsDelivr / `@fontsource`.
- **The document is the single source of truth** in a
  `<script type="text/markdown">`; Save is self-reproducing.
- **Follow the embedding guide** —
  `../orz-markdown/orz-markdown-skills/references/embedding.md` — for content CSS,
  the runtime, and copy-as-Markdown. Most content bugs in orz-slides were
  violations of it.
- **Pure transform modules** (pipeline-model) stay unit-testable; the assembled
  `.paged.html` must be **verified in a real browser** (presenting prints; editing
  + Save need Chromium).

## Network note

IPv6 is unreliable on this machine — prefix npm/git network commands with
`NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"`.

## Resolved decisions (DESIGN §7)

The architecture decisions are made: reimplement (don't vendor); **print the
paged.js page DOM**; **iframe** preview; **CDN fonts, no embedding**; **light
themes only**; page break = the **`::: page-break`** arbitrary-class container (no
orz-markdown change); debounced full re-pagination for v1; depend on
`orz-markdown`. Don't reopen these without reason; build against them.
