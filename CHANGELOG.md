# Changelog

All notable changes to **orz-paged** are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Release tooling

- Publishing no longer re-runs the 45–55 min suite: `npm run test:release`
  runs it once on the release commit (plus the column matrix — in full only
  when column code changed, else a fixed 40-case sample, `columns-matrix.ts
  --sample N`) and writes a green-run stamp (`.release/green.json`,
  git-ignored); both `prepublishOnly`s run the family release gate
  (`scripts/release-check.ts`, shared by every orz package, facts in
  `release.config.json`) and the stamp check, in seconds. New scripts
  `release:check`, `test:fast`, `test:changed`, `test:release`. Development
  tooling only; nothing shipped changes.
- A file that fails in the stamp run is re-run alone with only its failed
  tests (`vitest -t` on their exact names; up to 2 tries); a suite-level
  failure (a hook, the file itself, a failed suite no failed test explains)
  re-runs the whole file. The stamp records which, per try.

### Documentation

- The skill: a "Common mistakes" box (`{{mermaid}}` and friends are
  directives, not fences; no layout checker for paged; nested containers), a
  "Check the layout — count pages, fit to N pages" recipe (headless Chrome
  PDF page count; `font_size`, `line_height`, margins, columns and the
  third-of-a-page rule), every element field (`doi`, `instructor`,
  `tagline`, `website`, `align`, `organization`, `signature_space`, `photo`,
  `summary`, `border`, `placement` on `abstract`), values of the header and
  footer rule and font-size keys, inline is not offline, `--no-includes`,
  `--no-text`, the include reasons and `stale`; corrected: the
  `article-page` / `report-page` texts `new` writes set `front_matter:
  clean`, the `template:` key alone does not; `page_number_start_page` has no
  effect in 1.0.
- README: nine print themes plus `none`; `[--cdn | --inline]` in the
  `assemble` synopsis; checking the layout; inline is not offline; what
  `other-kind` means; links to files the package does not ship point to
  GitHub; the release-prep clause removed.
- `orz-paged-browser` README: the bundled kit version (2.3.0),
  `printDocument` in both export lists, `editHeader` explained, a "Browsers,
  delivery and limits" section. `docs/embedding.md`: the CSP recipe is one
  copy-pasteable policy (tested in Chrome) with its notes outside it, the
  Mermaid `style-src-elem` line spelled out, the `print` event listed.
- Surface round 2: copying from the pages gives Markdown (round 1 said the
  opposite; checked in Chrome), a code block broken across pages copies as
  pieces; only `article-page` / `report-page` write `front_matter: clean`
  (not `exam-page`); the `template:` key's one layout default is the page
  size; the pencil's *Template* item changes only that key; which commands
  print the `sha256`; `front_matter_clean` named; the embedding guide's
  policy vs the example's, `preview.nonce`, the bridge hash per kit version,
  Mermaid unreadable (not unstyled) without `style-src-elem`. `homepage` in
  both package.json files is markdown.orz.how/paged.html.

<a id="100"></a>

## [1.0.0] — 2026-10-12

A rebuild on the orz-markdown carrier kit (orz text format 1), the shape of
orz-mdhtml 1.0 with pages added. Requires `orz-markdown ^2.3.0`; Paged.js
pinned at 0.4.3; released together with `orz-paged-browser` 1.0.0.

### Breaking

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
  `selfVersion`, `CDN`; the 0.x runtime (`assets/app.js`, the legacy bundle);
  the 0.x CLI forms `--template`, `--new`, `--list-templates`, and `--title` /
  `--theme` on assemble (refused with the 1.0 command that does the same:
  `orz-paged new x.paged.md --template <t> --title "…"`, `orz-paged
  templates`; after creation, content comes only from the text's header).
- The 7 vendored themes are replaced by 9 print themes derived from
  orz-markdown's light themes (plus `none`); the 0.x ids stay valid; the
  default stays `light-academic-1`.

### The new file

- A document is its **text twin** `x.paged.md` and its **self-editing file**
  `x.paged.html` = `assemble(text)`: the exact text in the `#orz-src` island,
  an agent banner, `#orz-shell`, `#orz-meta` and head metadata from the
  header, `#orz-includes`, and a regenerable shell. Node and the browser write
  the same bytes; inline by default, `--cdn` for the web.
- **Pages in the page** (no frame): Paged.js lays the document out in the read
  view with the header's page size, margins, theme and typography. Page
  furniture: running headers and footers, page numbers (position and style),
  TOC page numbers, clean front matter, all in the theme's body font and
  muted colour. A long table repeats its header row on each page
  (`repeat_table_header`); long code and tall table rows break cleanly.
  Layouts are double-buffered, shown page by page as they are ready, and never
  block on a slow CDN (at most 2 s, then one re-flow).
- **12 templates** (article, report and exam, each as page or section; note,
  letter, cover letter, three CVs) with their document elements (title
  blocks, abstract, TOC, letterhead, CV header, exam questions).
- **Versions** (show/hide): `dynamic_choices` in the header and
  `data-show-when` content make several versions from one text (an exam and
  its answer key); the *Version* setting switches them.
- **Two columns across a page break** (the owner's hybrid): a short `.cols`
  block moves whole when that leaves less than a third of the page empty,
  otherwise it is split column by column; tables and code in columns are
  split or laid out as flow; limits documented. A 420-case integrity matrix
  (`scripts/columns-matrix.ts`) checks it.
- **Print themes** shipped inside the engine, so `--cdn` files style the
  same. `light-playful-1` is a ruled notebook page: the ruling follows the
  body leading and baseline, written blocks sit on the lines, and tables,
  code, callouts, quotes and figures are sheets attached on top (the paged
  runtime's baseline grid).
- **One quiet control**, the pencil: Edit, **Print** (from the read view, edit
  mode or the editor; Cmd/Ctrl+P waits for the final layout), Save, Download
  a copy, New document, **New document from template…**, Save as new copy,
  and the settings Theme, Page size, Template, Page numbers, Number style and
  Version (header edits, undoable); **Page zoom** (Automatic, Fit width,
  100 %, 125 %) is the reader's, never saved, and never changes the
  pagination.
- **Editor** (the kit's editor shell) with a live Paged.js page preview in a
  sandboxed frame: it lays out after a typing pause, from the first page the
  edit changed, and never blocks typing.
- Saves write `assemble(text)`, never the laid-out pages; a save over a file
  changed on disk asks; the quiet update (SHA-384-verified `release.json`);
  the host protocols (`orz-host-save@1`, `orz-host-ai@1`,
  `orz-host-include@1`; PROTOCOL.md points to orz-markdown
  `spec/host-protocols.md`).

### CLI and library

- `orz-paged new | assemble | extract | upgrade | inspect | themes |
  templates` (`orz-paged x.paged.md` = assemble; a plain `x.md` assembles to
  `x.paged.html`), `--json` everywhere with stable `reason` codes and `next`,
  the `sha256` / `--replaces` compare-and-swap, known earlier states (git, the
  CLI's pair record), backups `<file>~`, overwrite guards,
  `--resolve-includes` — orz-markdown's shared CLI core
  (`orz-markdown/carrier/node`) bound to this tool.
- The Node library (`assemble`, `extract`, `readDocument`, `newDocument`,
  `upgrade`, `inspect`, templates, themes, settings) inlines this release's
  verified engine.
- `orz-paged-browser`: IIFE + ESM (`globalThis.OrzCarrier`, FC-19),
  `mountEditor` with a Paged.js preview, `renderPreview(text, { document,
  pages, nonce })`, `release.json`; `docs/embedding.md` for web apps.
- Built on orz-markdown 2.3.0's kit additions (no local workaround left):
  action submenus, block-value settings (Version), reader controls with named
  choices (Page zoom), static enhancement for pagination, `normalizeHeader`,
  `lintHeader` with the print themes, the `inspect` and CLI cores.

### Quality

- Five closed-loop rounds before the release fixed typing freezes on long
  documents, blank pages on a hanging CDN, TOC layout, column and table
  integrity (including UPSTREAM Paged.js 0.4.3 faults: lost table rows,
  repeated or skipped code lines, an unbounded font wait), late webfonts,
  print readiness and the incremental preview.
- Tests: orz-markdown's carrier conformance harness (46 checks, no skips),
  the corpus round trip, the CLI spawned with golden outputs and the "follow
  every next verbatim" matrix, real Chrome for pages, print, columns, tables,
  code, themes and the ruled paper; claims in `notes/CLAIMS.md`; examples
  kept fresh by a test.
- Size: the engine is ~1.7 MiB (the paged runtime without css-tree's
  validation data).

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
