# Changelog

All notable changes to **orz-paged** are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### 1.0.0 (prepared on branch `rebuild/1.0`)

A rebuild on the orz-markdown carrier kit (orz text format 1), the shape of
orz-mdhtml 1.0 with pages added. Requires `orz-markdown ^2.3.0`; Paged.js
pinned at 0.4.3; to be released together with `orz-paged-browser` 1.0.0.

#### Breaking

- The 0.x files, Node API and CLI shape are replaced. 0.x files are not
  opened as they are: `orz-paged upgrade old.paged.html` writes a format-1
  file and its text twin — the settings block (wherever 0.x found it) and a
  `kind: meta` block become one header at the top with `carrier: paged` and a
  `uid`; `#orz-meta` and the title move in; the settings mean what they meant.
  `orz-paged inspect` says what any file is and what to do.
- The header is the settings source: a `{{nyml kind: document}}` block that
  does not lead the text is no longer read (lint `stray-document-block`).
- Removed: `buildPagedHtml`, `composeInlineHtml`, `loadThemes`,
  `loadTemplates`, `pickDefaultTheme`, `findAsset`, `stripBaseImport`,
  `selfVersion`, `CDN`; the 0.x runtime (`assets/app.js`, `src/template.ts`,
  `src/browser-entry.ts`, the legacy bundle); the 0.x CLI forms `--template`,
  `--new`, `--list-templates`, and `--title` / `--theme` on assemble (refused
  with the 1.0 command that does the same: `orz-paged new x.paged.md
  --template <t> --title "…"`, `orz-paged templates`; after creation, content
  comes only from the text's header).
- The 7 vendored themes are replaced by 9 print themes derived from
  orz-markdown's light themes (plus `none`); the 0.x ids stay valid; the
  default stays `light-academic-1`.

#### The new file

- A document is its **text twin** `x.paged.md` and its **self-editing file**
  `x.paged.html` = `assemble(text)`: the exact text in the `#orz-src` island,
  an agent banner, `#orz-shell`, `#orz-meta` and head metadata from the
  header, `#orz-includes`, and a regenerable shell. Node and the browser write
  the same bytes.
- **Pages in the page** (no frame): Paged.js lays the document out in the read
  view with the header's page size, margins, theme and typography; running
  headers and footers, page numbers, TOC page numbers, clean front matter;
  re-renders are double-buffered (never an empty view). The page furniture
  (running headers and footers, page numbers) takes the theme's body font and
  muted text colour (`--orz-furniture-font` / `--orz-furniture-color`). A
  long table repeats its header row on each page it continues on
  (`repeat_table_header`, on by default: a Paged.js handler — 0.x's
  `table-header-group` rule did nothing under Paged.js).
- **One quiet control**, the pencil: Edit, **Print**, Save, Download a copy,
  New document, Save as new copy, the settings Theme, Page size, Template,
  Page numbers, Number style, **Version** (header edits, undoable; Version
  writes the header's `dynamic_choices`, offered while the document defines
  choices), **New document from template…** (a submenu of the 12 templates; a
  fresh file, the current text is never replaced) and **Page zoom** (Automatic, Fit
  width, 100 %, 125 %; the reader's, never saved).
- **Editor** (the kit's editor shell) with a Paged.js page preview in a
  sandboxed frame; the paged settings and Version in its bar.
- Saves write `assemble(text)`, never the laid-out pages; a save over a file
  changed on disk asks (*Replace it* / *Download a copy instead*); the quiet
  update (SHA-384-verified `release.json`); the host protocols
  (`orz-host-save@1`, `orz-host-ai@1`, `orz-host-include@1`; PROTOCOL.md is a
  pointer to orz-markdown `spec/host-protocols.md`, shipped).
- **Two columns across a page break** (the owner's hybrid): a short `.cols`
  block moves whole to the next page, a long one is split column by column;
  limits documented.
- **Print themes**: one per light orz-markdown theme, keeping its decoration
  where it suits paper, shipped inside the engine so `--cdn` files style the
  same. `light-playful-1`'s ruled paper follows the text: the page ruling is
  set at the body leading and the body font's baseline, and every block starts
  on the grid (the paged runtime's baseline-grid handler); other blocks hide
  the ruling behind their own paper.

#### CLI and library

- `orz-paged new | assemble | extract | upgrade | inspect | themes |
  templates` (`orz-paged x.paged.md` = assemble; a plain `x.md` assembles to
  `x.paged.html`), inline by default, `--cdn` for the web, `--json`
  everywhere with stable `reason` codes and `next`, the `sha256` /
  `--replaces` compare-and-swap, known earlier states (git, the CLI's pair
  record), backups `<file>~` / `~1`…, overwrite guards, `--resolve-includes`,
  the delivery kept on re-assembly — orz-mdhtml 1.0's rules, now
  orz-markdown's shared CLI core (`orz-markdown/carrier/node`, 2.3.0) bound
  to this tool.
- The Node library (`assemble`, `extract`, `readDocument`, `newDocument`,
  `upgrade`, `inspect`, templates, themes, settings) inlines this release's
  verified engine: callers pass no engine source.
- The browser package `orz-paged-browser` (IIFE + ESM, `globalThis.OrzCarrier`,
  `mountEditor` with a Paged.js preview, `renderPreview`, `release.json`) and
  `docs/embedding.md` for web apps.
- Tests: orz-markdown's carrier conformance harness (all 46 checks, no skips),
  the corpus round trip, the CLI spawned with golden outputs and the "follow
  every next verbatim" matrix, real Chrome for pages, print, columns, themes
  and the ruled paper; examples kept fresh by a test.
- Built on orz-markdown 2.3.0's kit additions (no local workaround left):
  action submenus (New document from template…, `app.newDocument({ text })`),
  a setting writing a block value with `choicesFor` / `apply` / `hidden`
  (Version, in the handle's list and the editor's toolbar), a reader control
  with named choices (Page zoom, the preference `reader.pageZoom`),
  `enhanceDocument(root, { static: true })` (charts and SMILES as images for
  pagination), `normalizeHeader` (the 0.x header merge), `lintHeader` /
  `readDocument` with the print themes (a header `theme` outside them is the
  warning `unknown-theme`), the kit's `sha256`, `readLegacyIsland`, the
  `inspect` core and the CLI core.

#### Owner UI revisions before the release (2026-10-11)

- `light-playful-1` is a ruled notebook page: the ruling is part of the paper
  and is never hidden by text. Paragraphs, lists, headings (every level, a
  whole number of lines, straight; a large one spans two), display formulas
  (baseline on a rule, height rounded up to whole lines), quotes (framed
  along two rules), rules, footnotes and the TOC element are written on the
  lines with no background; tables, code, callouts, figures and pictures,
  diagrams, columns and the boxed document elements (title blocks, abstract,
  letterhead, CV header, exam questions) are sheets attached on top — a
  lighter paper with a hard shadow (figures taped on), each starting and
  ending on a rule with one blank line around it. The baseline grid
  (`src/paged/baseline-grid.ts`) measures each written kind's baseline on a
  probe (`--orz-sh-*`, `--orz-mb-*`, `--orz-fr-*`), aligns display formulas
  and grows sheets to the next rule; a title block or TOC on its own page
  starts at the top of the ruled page. P.9 checks it per line, per sheet edge
  and by pixels.
- Element fields of lines (`address`, `contacts`, `title`, `organization`)
  split on line breaks as well as `|`: the templates' addresses and CV
  contacts, written one per line, ran together on one line.
- `theme: none`: callouts are told by a tint, a frame and a coloured label
  instead of a stripe down their side.

#### Closed loop, round 1 (fixes before the release)

- **Typing on a long document no longer freezes.** The Version setting's
  `hidden` was a full render after every pause in typing; it is now a cheap
  text test (the render belongs to the picker's opening, and reads what the
  read view or the editor already rendered). The editor preview lays the
  pages out only after a real pause (1.5 s, grown to twice the last layout)
  and never forces a layout while keys arrive (the kit's
  `preview.maxWaitMs: Infinity`). On a 26-page exam: per key median 13 ms,
  p90 38 ms, no long task while typing.
- **A slow or hanging CDN no longer keeps the page blank.** Fonts,
  stylesheets, libraries and images are awaited at most 2 s (was up to
  20 s + 6 s + 8 s + 8 s); the pages show with what has arrived and are laid
  out once more when the rest settles, keeping the scroll position; Print
  waits for that final layout.
- **Table of contents:** the runtime fills the structure the print layer
  styles (text, dotted leader, right-aligned number) — the numbers no longer
  run into the entries, in every theme; `max_level` up to 6 honoured; nested
  levels indented.
- **Columns:** a list item that cannot keep anything on a page no longer
  loses its nested lists; a text block whose glyphs fit but whose last line
  box does not is cut before that line (it moved whole, leaving the column
  part-empty); an ended column's placeholder draws nothing; two columns stay
  two on A5 (`--orz-col-min: 9rem` on the page).
- **light-playful-1:** the ruling is drawn by the page box, not a positioned
  page area — a paragraph after a quote lost its last lines at the page
  bottom; a paragraph that runs over the page bottom is placed on the grid by
  its first fragment.
- **Cmd/Ctrl+P in edit mode** leaves the editor and prints the pages (it
  printed a blank page).
- **Version** is offered when versioned content arrives through an include.
- `new --title` also replaces the template's placeholder title in its title
  block or first heading and in a running header that repeats it; *New
  document from template…* suggests `<template>.paged.html`.
- `new`/`assemble --json` report `themeEffective` (the theme the pages use)
  next to `theme` (as written).
- Lint warns `invalid-value` on a value an enumerated paged key does not take
  (`page_size`, `page_number_position`, `page_number_style`, `template`, the
  font presets, `front_matter`).
- `upgrade`: the `}}` repair runs only when the lines up to the lone `}}` are
  indented or blank (else a note); a 0.x settings block inside a code block
  or an HTML comment is noted.
- Print themes drop `scrollbar-*` properties; the exam template's comment
  names *Version*.
- Size and boot: the paged runtime no longer bundles css-tree's validation
  data (mdn-data): 594 → 339 KiB; the engine 1948 → 1700 KiB.
- Packaging: `npm run build` starts from an empty `dist/` (stale modules no
  longer ship); the real-Chrome test files run one at a time (vitest project
  `chrome`).

#### Closed loop, round 2 (fixes before the release)

- **Table of contents laid out with the pages.** The list is built before
  Paged.js lays out (text, leader, a fixed-width placeholder number; only the
  numbers are set afterwards, in every fragment of a TOC that runs over
  pages): filled in afterwards it pushed what followed it off its page — the
  stock `report-section` template never printed its *Findings*.
- **Columns:** a ratio block (`::: cols 1 2`, an inline style) is no longer
  skipped by Paged.js' undisplayed filter (its continuation never broke: text
  lost or repeated); a re-planned cut moves by at least a line; the empty
  head of a block moved whole no longer leaves a blank page; an exam question
  taller than the space at a page top is split instead of clipped (Paged.js
  then broke the grid); three auto columns stay three on A5
  (`--orz-col-min: 7rem` for exactly three). The whole-document integrity
  oracle (per-column text, tags, clipping, the hidden off-page column, blank
  pages, grid breaks) is a test over the column fixtures and a theme × size
  matrix; `scripts/columns-matrix.ts` runs all 360 cases (all clean).
- **Late webfonts:** a CDN that never answers costs at most 2 s + 20 s
  before the final layout (the re-flow waited 20 s a second time: Print
  waited 44.5 s).
- **Typing after a pause** no longer freezes: a pagination of an older text
  stops at its next page when the editor reports an edit; the stage is not
  styled or laid out again when the fonts are loaded; Paged.js' setup lets
  the input in between its steps; the frame acknowledges a render within
  1 s, so the editor's pacing stays about 3 s on a long document (the
  preview was 9–13 s behind on a 27-page report). The preview and the read
  view show a quiet "updating…" mark while they are behind.
- **Theme switch:** the old theme's styles (light-playful-1's grid) no longer
  shape the new layout.
- **Print:** Print and Cmd/Ctrl+P (read view, edit mode, the editor and its
  preview frame — the kit's key, orz-markdown 2.3.0) wait for the final
  layout, with a quiet "Preparing pages…"; a print from the browser's menu in
  edit mode shows the pages, not a blank sheet.
- **Tables** repeat their header row on continuation pages (a Paged.js
  handler); the **page furniture** takes the theme's body font and muted
  colour; an exam question header reads "1. (2 pts)"; `new --title`
  round-trips any title; Version's `hidden` follows renders.

#### Closed loop, round 3 (fixes before the release)

- **Long highlighted code printed wrong** (UPSTREAM Paged.js 0.4.3): on every
  page continuing a highlighted fence the newlines between tokens were
  skipped (a 300-line fence lost lines 51–300 off the area), and a code line
  could be cut through at the page bottom (a page-tall fence over-ran the area
  by up to 21 px). Whitespace between tokens is kept and a code break moves to
  the start of the line (`src/paged/code-break.ts`; R.12).
- **Tables in columns**: a table taller than the rest of the page inside
  `.cols` is split between rows within its column (widths kept, header
  repeated); a row taller than a column page lays the block out as plain flow.
  No broken grid, no row in the hidden column (C.6).
- **Long tables lost a row at unlucky lengths** (UPSTREAM Paged.js
  `findOverflow`): the fragment's column widths are frozen before the
  overflow is removed and a bottom-flush row moves on; a header is never left
  alone at a page bottom (P.11, a length sweep).
- **Column move threshold** (owner): a short `.cols` block moves whole only
  when that leaves less than a third of the page empty; otherwise it is split
  (`MOVE_WHOLE_MAX_EMPTY`, C.4).
- **A blocked font server** is waited for once per session; later layouts
  and Print are final at once (R.13).
- **First open**: "Laying out pages…" at once, the pages shown one by one as
  they are laid out (first page ~0.3 s after the parse on a 35-page report,
  was ~5 s; R.14).
- **The preview is live**: it re-lays out from the page the edit changed and
  swaps pages in as they are ready, 0.8 s after typing stops — the edited
  page shows ~1.2 s after the last key on a 35-page report (was 7.7–9.1 s; E.6).
- **Print**: one pending print at a time, "Preparing pages… (n of N)" (R.15);
  apps print the document's pages with the kit's `printDocument` and
  `renderPreview(text, { document: true, pages: true, nonce })`; an assembled
  file sets `window.__orzPrintReady` (X.4).
- `renderPreview(…, { document: true, nonce })` stamps its `<style>` (X.4).
- `aria-busy` with the "updating…" mark; a TOC on its own pages continues at
  the top of the next page; Paged.js ticks on a timer in a frame without
  animation frames (an off-screen preview, a print frame stalled).
- `front_matter: yes` (and the other yes-words) stays a synonym of `clean`
  (owner), documented.

#### Closed loop, round 4 (fixes before the release)

- **Long code with the real highlight.js printed wrong** (UPSTREAM Paged.js
  0.4.3 finds a break's text node by its content): the text between tokens
  repeats on every line, so a long fence repeated or skipped lines, Paged.js
  stopped ("Layout repeated") and the rest of the document was lost. Every
  text node of code now has its own element, the 4000-character step cap is
  gone, a blank line at a page bottom is measured like any line, and prose
  with a phrase repeated between inline elements gets the same treatment.
  Tested with the real highlight.js 11.9.0 (vendored; the stand-in is
  retired) on real sources (R.12).
- **Page zoom changed the pagination**: the zoom (and the editor preview's
  fit) was applied while the first layout ran, so a narrow window laid out —
  and printed — other pages. A layout now always runs at 100 %; the zoom
  follows when it ends (R.16).
- **Late fonts**: a font server that answers after the page gave up on it now
  re-lays out the pages once, and Print prints that layout (R.17); Paged.js'
  own unbounded wait for every declared font (UPSTREAM `loadFonts`: a font
  file that never arrived kept the page blank for good) is bounded, a face it
  gave up on making the layout provisional with one re-flow (R.6, R.13).
- **The preview**: an edit undone while it re-laid out (a key typed and
  deleted) no longer leaves it half old, half new, "updating…" for good
  (E.8); the incremental re-layout is not used on a ruled grid
  (light-playful-1) and is tested against whole layouts — layout key, restart
  point, dirty pages, columns and tables, provisional layouts (E.7); the
  scroll position holds across interim swaps (`overflow-anchor: none`, E.6).
- **Tables**: a header that would stay alone at a page bottom — or with only
  a bottom-flush first row that ran into Paged.js' hidden column — moves the
  table to the next page (report-35 p19); frozen column widths are the cells' only,
  clamped to the page (P.11).
- **Two columns**: the third-of-a-page threshold holds for every move; a
  column opening with a table keeps it when its header and first row fit; a
  heading never ends a column's part on a page (C.4).
- **Chrome**: icons for Template, Page numbers, Number style, Version and Page
  zoom; Version's "(not set)" reads "default" (K.1, K.4).
- Bundles orz-markdown 2.3.0's preview bridge that closes the `window.event`
  port theft; the real paged preview is tested against it (E.9).

#### Closed loop, round 5 — closing

Round 5 found no isolation fault; one HIGH single-construct layout fault and
some MED/LOW ones, all fixed:

- **A table row taller than the page** (HIGH; a 360-word answer in a
  "Question / Answer / Pts" table): the row, the later rows and everything
  after the table were lost ("Layout repeated"). Such a row now breaks inside
  under its header (its fragment's widths frozen as measured with the whole
  row, the break found clear of its bottom padding); a page that continues a
  row starts without the repeated header, which returns on the next page that
  starts with a row. A caption kept alone at a page bottom moves on with its
  table; the repeated header's source is found by `data-ref`; header cells
  wrap on paper (a neat theme's one-line header ran past the page edge).
- **Periodic text in plain fences** (a `0 0 0` matrix, an ASCII grid, a run
  of `}` lines): lines repeated or lost and the rest of the document gone. A
  fence's text is split into one span per line; the line start of a blank line
  alone in its span is found right; the half-leading is the code's own line
  height.
- **Code in columns** taller than a column page lays its block out as plain
  flow (it was clipped and the grid broken).
- **The editor preview**: an edit inside code re-lays the preview out whole
  (an incremental restart before the fence broke it a line away from a fresh
  layout).
- **Tests**: tall-row tables (P.11), periodic fences and tall-leading code
  (R.12), code in columns (C.6), an edit inside a fence (E.7), a stored page
  zoom before the first layout (R.16), the bridge's key-getter override, its
  unwritable hooks and scroll sync without reader input (E.9, the kit's
  E.35); the integrity oracle adds `HIDDENTEXT` and checks `REPEAT` and
  `HEADONLY` against the table's own header and rows. Mutants P05 and P10 are
  now caught; P08 (the width clamp) is equivalent (recorded in CLAIMS P.11).

## [0.7.3] — 2026-07-17

### Changed

- Depends on `orz-markdown ^1.6.3` (was `^1.4.1`).
- Package metadata: a new description ("Single-file, self-editing Markdown
  documents laid out as print-ready pages…"), `homepage`
  (https://markdown.orz.how/family.html#paged) and `bugs` for both packages;
  "self-contained" reworded as "single-file" in the skill.

## [0.7.2] — 2026-07-16

### Changed

- Package description rewritten around the self-editing file (published
  metadata only; no code change).

## [0.7.1] — 2026-07-16

### Changed

- README leads with "Markdown that edits itself" (the family's positioning);
  a stale version reference fixed. No code change.

## [0.7.0] — 2026-07-11

### Added

- **`orz-host-include@1`** — a hosted paged document resolves `{{md-include https://…}}` for its preview via the host; the engine paginates the resolved text while the saved source keeps the raw directives (a rawSource stash). Standalone never resolves and never auto-fetches. See PROTOCOL.md.

## [0.6.1] — 2026-07-11

### Security

- Updated build/test tooling to fixed `esbuild ^0.28.1` and `vitest ^4.1.10`
  releases. Runtime dependencies and generated document behavior are unchanged.

### Packaging

- Ship the MIT license in both the CLI and browser npm packages.

## [0.6.0] — 2026-07-11

### Added

- Portable document metadata. A source-level `{{nyml kind: meta}}` block is
  consumed at generation time and emitted as standard `<head>` tags plus an
  `#orz-meta` JSON island. Programmatic callers can pass `metadata` to
  `buildPagedHtml`; host values win field by field. Requires
  `orz-markdown ^1.4.0`.

### Changed

- The generic `{{nyml}}` scanner is now shared from orz-markdown, giving the
  family one parser for metadata and paged document blocks.

## [0.5.0] — 2026-07-08

### Added

- **Embedded agent guide.** Every generated `.paged.html` now carries an
  invisible HTML comment (top of `<body>`) telling an AI agent how to edit it —
  what the file is, where the editable source lives (`<script id="orz-src">`), the
  block-ID rules, and how to fetch the official orz-paged agent skill
  (`https://cdn.jsdelivr.net/npm/orz-paged/orz-paged-skills/SKILL.md`). Invisible
  to readers; readable by any external AI app opening the file's source, so it can
  edit with the correct page model and a byte-identical round-trip.
