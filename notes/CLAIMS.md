# orz-paged claims registry

Each claim is one sentence that is true or false about this package, bound to
an oracle that decides which. A test proves a claim by carrying its id in its
title (`[A.1] …`, or in its `describe` title). `tests/claims.test.ts` fails if
a claim here has no test, or a test names a claim that is not here — an
unverified claim is red (the pattern of orz-markdown's and orz-mdhtml's
`tests/claims.test.ts`).

A known gap is kept as a **probe**: `it.fails('[ID] …')`, a strict expected
failure that turns red the day it starts passing, so the fix has to promote it.

Oracles: **scenario** (behaviour end to end), **conformance** (code obeys a
rule), **corpus** (runs over the shared golden corpus,
`orz-markdown/tests/carrier-corpus/paged`, read from the installed package),
**real** (runs in real Chrome through playwright-core, channel `chrome`), **unit**
(a pure transform module). A **real** test skips when Chrome is not installed;
such a run does not verify that claim.

Binding specs: orz-markdown `spec/FC-18-text-format-1.md` (text format 1,
§5.1 paged keys, §7.3 paged body grammar, §8.1 title chain, assembly laws),
`spec/FC-19-editor-component.md` (exports), the family plan
`../docs/REBUILD.md` §3b.

## B — base (rebuild step 1)

| ID | Claim | Oracle |
|---|---|---|
| B.1 | The package depends on orz-markdown `^2.3.0` and pagedjs `0.4.3` (pinned exactly: the two-column handler is tested against it) and builds without shims or aliases: no `build/shims`, no `path-browserify`, no injected `process`, no version `define`; the orz-markdown version comes from `orz-markdown/version` and orz-paged's from `src/version.ts`, never from a `package.json` walk; the engine bundles for the browser as it is. | conformance |
| B.2 | There is one paged theme list (`src/themes.ts`): the stylesheets in `assets/themes` plus `none`, the same ids as the theme fonts, and the default theme is one of them. | conformance |
| B.3 | `VERSION` (src/version.ts, the shell version every file records) equals the package version. | conformance |
| B.4 | No escape helper is copied into the TypeScript sources: they use the kit's `escapeHtml` / `escapeAttr` (`orz-markdown/carrier/read`). | conformance |
| B.5 | The test setup is orz-mdhtml's: vitest projects `main` and `conformance`, playwright-core real-Chrome tests that skip without Chrome, and this live claims registry. | conformance |

## S — the header is the settings source (FC-18 §5, §5.1, §7.3)

| ID | Claim | Oracle |
|---|---|---|
| S.1 | The settings of a text are its FC-18 header's fields, read by the kit's `readHeader` (the flat nyml reader: `kind` excluded, quotes removed, `|` values dedented), and the renderer renders `withoutHeader(text).body`; resolved settings are DEFAULTS ← the header `template`'s layout layer ← the header's keys. | unit |
| S.2 | Changed meaning from 0.x, by design: a `{{nyml kind: document}}` block that does not lead the text is no settings source (lint `stray-document-block`; `upgrade` moves a 0.x file's block), and keys indented under a scalar key are ignored (lint `ignored-line`). | unit |
| S.3 | Every paged key of the kit registry (`KIND_HEADER_KEYS.paged`) and `theme` is read from the header with its 0.x meaning (types, aliases, `front_matter` / `front_matter_clean`, the `dynamic_choices` map), and the normalizer knows no key outside the registry; the private 0.x parser is gone. | unit |
| S.4 | The renderer reads the header: every paged corpus document renders with its header's resolved settings and without the header text. | corpus |
| S.5 | Defaults, coercions (numbers, booleans, page-size aliases, custom sizes) and layer merging are unchanged from 0.x. | unit |

## T — today's transforms (kept from 0.x)

| ID | Claim | Oracle |
|---|---|---|
| T.1 | The twelve element kinds render as in 0.x (wrappers, fields, placement, answer reveal, escaping). | unit |
| T.2 | Page CSS (`@page` size and margins, page numbers, running headers and footers, tokens, front matter, layout behaviour, first-page suppression) is built as in 0.x. | unit |
| T.3 | The 12 templates (layout layers, legacy aliases, skeleton files) are as in 0.x, and every skeleton renders into pages. | unit |
| T.4 | Dynamic choices (`data-show-when` / `data-hide-when`, key normalisation, collection) work as in 0.x. | unit |
| T.5 | Font presets are as in 0.x. | unit |
| T.6 | `renderDocument` (0.x `assemble`) scans element blocks with the kit's token-based scanner, renders them in place, ignores commented-out blocks and composes page, element and custom CSS. | unit |

## L — the Node library (rebuild step 5)

| ID | Claim | Oracle |
|---|---|---|
| L.1 | The library's inline assembly carries this release's browser bundle: `dist/orz-paged.browser.js` is the build's IIFE (= `orz-paged-browser`'s file), checked against its `release.json` (kind, version, path, SHA-384, script-safe) before use and refused — never inlined — when missing, stale, altered or unsafe; `assemble`, `upgrade` and `inspect` need no engine from the caller and equal the isomorphic functions with that engine. | scenario |
| L.2 | The package is the 1.0 surface: the library exports the format-1 API only (`assemble`, `extract`, `readDocument`, `newDocument`, `upgrade`, `inspect`, `readLegacy`, the templates, themes, settings and versions); the 0.x API (`buildPagedHtml`, `composeInlineHtml`, …) and the 0.x runtime (`assets/app.js`, `src/template.ts`, `src/browser-entry.ts`, `src/paged.ts`, the legacy bundle) are gone; bin `orz-paged`, exports and files as published. | conformance |

## A — the isomorphic assembler (FC-18 §2, §8)

| ID | Claim | Oracle |
|---|---|---|
| A.1 | Round trip: `extract(assemble(T, o)).text === T` exactly, for every `paged` corpus file, the 12 template skeletons and every hazard text (CR LF, CR, BOM, astral characters, `</script>` and `<script` in body, header and `custom_css`, element blocks, a settings block in a code fence, `<!--`, no final newline, a 100 kB line, the empty text), for inline and CDN delivery, with and without includes. | corpus |
| A.2 | Determinism: `assemble(T, o)` gives the same bytes on every call and after a fresh module load; the assembler modules use no clock, randomness or environment. | corpus |
| A.3 | Idempotence: `assemble(extract(F).text, o) === F` for every file `F` made with options `o`. | corpus |
| A.4 | Content independence: the shell parts depend only on the options and on the header's presentation (theme, font presets and page size, resolved by `presentationOf` through `resolveSettings`; never read from the body) — texts with the same presentation get the same shell parts, which hold no other document data — and the document parts are the same for every delivery and engine. | corpus |
| A.5 | The envelope is the kit's: `#orz-shell` is `{kind: "paged", format: 1, shell: VERSION, delivery}`, the generator is `orz-paged VERSION`, `data-orz-kind="paged"`, the agent banner names `#orz-src` and the orz-paged skill, `#orz-includes` holds exactly the includes given, `<title>`, `lang` and `#orz-meta` come from the header, and the output equals `assembleEnvelope` with this shell's parts — head: viewport, colour scheme, `#orz-katex`, `#orz-hljs` and the presentation's webfont links (written `media="not all"`: switched on by the read view); body: `#orz-view` > `#orz-pages` (holding one constant fallback line of the delivery), `#orz-chrome`, `#orz-engine`. | scenario |
| A.6 | Delivery: inline puts the given engine source in the file once; CDN references `https://cdn.jsdelivr.net/npm/orz-paged-browser@<VERSION>/orz-paged.browser.js` (the kit's `bundleUrl`) and holds no engine code. | scenario |
| A.7 | `assemble` refuses (throws) a text with NUL or a lone surrogate, a header `format` above 1, an unknown delivery, inline delivery without an engine source, and an engine source that is not script-safe. | scenario |
| A.8 | The assembler modules (`assemble`, `inspect`, `legacy`, `themes`, `version`, `starters`, `doc/settings`, `doc/templates`) import no Node built-in: they bundle for `platform: browser` with nothing external. | conformance |
| A.9 | Browser parity: the assembler bundled for the browser — and the real bundle's `OrzCarrier.assemble` (inline with the bundle given and defaulted, cdn, with and without includes) — run in real Chrome writes byte-identical files to Node for every paged corpus file, template and hazard text. | real |
| A.10 | `extract` is the kit's own function; `readDocument` is the kit's with this carrier's default kind (`opts.kind`, else the file name's, else the header `carrier`, else `paged`). | conformance |
| A.11 | The title (FC-18 §8.1, paged): the header `title`, else the first top-level level-1 heading, else the `title` (else `text`) of strictly the first `*-title` element, else `Untitled` — for every corpus document as the manifest derives it. | corpus |

## N — newDocument and templates (FC-18 §3, §7.3, §10)

| ID | Claim | Oracle |
|---|---|---|
| N.1 | `newDocument({ template?, title?, theme?, uid? })` returns the template's skeleton with `carrier: paged` and the `uid` right after `kind: document`, then the template's own header lines, with `title` / `theme` set in place; for every template `lintHeader` reports nothing, `readDocument` gives kind `paged`, the uid and the title, and it renders with the template's settings. Default template `note`; legacy names resolve. | scenario |
| N.2 | Without an injected uid each call mints a fresh one (the kit's `mintUid`); with one, the result is a pure function of the options. | scenario |
| N.3 | `newDocument` refuses an unknown template or theme, a malformed uid and a value the header cannot hold (line break, `}}`). | scenario |
| N.4 | A new document of every template assembles and extracts back exactly, and its file's `<title>` and `#orz-meta` come from its header. | scenario |
| N.5 | The 12 templates are text skeletons in `assets/templates`, each with a format-1 header (`kind: document`, a `title`, its `template`), lint-clean; `src/starters.ts` (generated) holds them byte for byte. | conformance |

## I — inspect (agent readiness, REBUILD §3b)

| ID | Claim | Oracle |
|---|---|---|
| I.1 | On an assembled format-1 file, `inspect` reports input `assembled`, kind, format, shell version, generator, delivery, relation to this tool, uid, title, theme, template, header keys, the paged settings, includes, sha256, lint and structure checks (island, end, engine); it advises re-assembly for an older shell or an altered engine and the newer tool for a newer shell; another kind is pointed to its carrier. | scenario |
| I.2 | On a legacy 0.x file, `inspect` reports input `legacy`, its version, generator, delivery, `<title>`, `#orz-meta` keys and where its settings and `kind: meta` blocks are (`header` / `body` / `none`), the title and template as `upgrade` would arrange them, the sha256 of its source, no format, not writable, notes (e.g. a `}}` in `custom_css`), and advises `orz-paged upgrade` (with `--text` next to a text twin). | scenario |
| I.3 | On a text, `inspect` reports input `text`, the kind (file name, else header `carrier`, else `paged`), format, uid, title, header keys, sha256 and lint for every paged corpus text; a newer format is read-only, another kind is pointed to its carrier, lint errors and a stray settings block are named in the advice; the twin check reports same / different / none and an earlier state. | corpus |
| I.4 | On HTML that is not an orz file (or an empty file), `inspect` reports input `html` and does not claim a document. | scenario |
| I.5 | The report is plain JSON data and deterministic. | scenario |

## U — upgrade of legacy 0.x files (REBUILD §3b, owner decision 7)

| ID | Claim | Oracle |
|---|---|---|
| U.1 | Text kept: for every real 0.7.3 file and synthetic hazard source, the upgraded text holds every non-whitespace character of the legacy source (the island unescaped, its wrapper removed); when the settings block already leads, the body after the header is the source's body exactly and every header line is kept — for files whose `.md` is at hand, its body byte for byte. | scenario |
| U.2 | One header: the settings block and a `kind: meta` block become ONE FC-18 header (the kit's `editHeader` merge: settings lines first, then the meta-only keys), with `carrier: paged` and a uid (`#orz-meta`'s when valid, else injected or minted); `#orz-meta` (DocMeta the 0.x library consumed) moves in; `<title>` only when the text has no title of its own; the settings resolve as in 0.x. | scenario |
| U.3 | A settings block or `kind: meta` block anywhere in the source (0.x read the settings anywhere) is moved to the top as written, in the source's line ending, leaving the rest of the text in place; on a clash the settings block wins and the meta value is named in the notes. | scenario |
| U.4 | The upgrade's file is the text's assembly and extracts back exactly; a format-1 file is re-assembled with its text and includes unchanged; upgrading twice changes nothing more. | scenario |
| U.5 | A `}}` inside a settings value (which ended the block early, in 0.x too) is written `} }` — the same CSS in `custom_css` — when the block evidently goes on to a lone `}}` line, and reported; a `}}` that really ends the block is left alone. | scenario |
| U.6 | Nothing unrecognised is dropped silently: an island without the 0.x wrapper, restored `<\/script` escapes, a meta value the header cannot hold, an invalid uid, a block that cannot move exactly (it stays), a second settings block (it stays), an unreadable config are kept or noted; inline 0.x files read like CDN ones; non-orz input and other carriers' files are refused. | scenario |

## P — the print themes (REBUILD §3b guide 3, D-42)

| ID | Claim | Oracle |
|---|---|---|
| P.1 | There is one print theme per light orz-markdown theme, with the same id and in orz-markdown's picker order, plus `none`; each is generated by `scripts/build-themes.ts` from the installed orz-markdown's theme file (base.css from its `common.css`), and the committed files are what the script writes now; the 0.x ids stay valid and the default theme is one of them. | conformance |
| P.2 | No print theme (nor base.css) carries a screen-only construct: no `@media` or `@import`, no hover/focus/active/visited states, selection or scrollbar styling, no transition, animation, cursor, scroll or user-select property, no fixed or sticky position, no viewport unit, no blurred shadow, no `html`/`body` rule, no QR overlay. | conformance |
| P.3 | Every print theme is safe for paged.js and the browser: no comma inside `:is()`/`:where()`/`:has()`/`:not()` (paged.js splits selectors on commas), and Chrome parses every rule the build wrote. | real |
| P.4 | Each print theme sets the paged tokens from its source (`--page-bg`, `--accent`, `--font-body`, `--font-heading`, `--font-code`, `--text-main`, `--heading-color`) and re-points the source's own variables at them, so the header's `page_background`, `decoration_color` and font settings restyle it. | real |
| P.5 | Each theme paginates a rich sample (headings, lists, table, code, quote, callouts, math, two columns, badges, footnote) in real Chrome through paged.js without an error, with its webfonts loaded; the first page is written to `/tmp/paged-themes/<id>.png`. | real |
| P.6 | Body text and headings on the first page reach 4.5:1 against what they are printed on, in colour and in greyscale. | real |
| P.7 | Each theme's webfonts (`src/doc/theme-fonts.ts`) are exactly the stylesheets its source theme imports, and its families are the source's. | unit |
| P.9 | light-playful-1's ruled paper follows the text (owner decision 2026-10-09): the ruling covers each page's content box from its top at the body leading (`--orz-grid` = `font_size` × `line_height`, absolute) and at the body font's measured baseline (`--orz-rule-at`, the paged runtime's baseline-grid handler); every top-level block starts on the grid; on every page of a rich three-page document laid out by the real runtime, each sampled line of running text sits on a rule (the rule 0–3 px under its baseline), no running text leaves the grid, and every other block hides the ruling behind an opaque background. | real |
| P.8 | The derivation's transforms keep what prints and drop what does not: blurred shadow layers go and hard ones stay; viewport clamps take their upper bound; px/rem font sizes become em of the theme's body size; comma lists in functional pseudo-classes expand without changing meaning. | unit |

## W — the browser engine and its package (rebuild step 3)

| ID | Claim | Oracle |
|---|---|---|
| W.1 | The bundle rule: the IIFE `orz-paged.browser.js`, the ESM build and the paged runtime hold no `<script` / `</script` (any case, after backslashes), no CR, no NUL, only ASCII; the build rewrites `<` as `\x3C` and checks before computing the integrity. | conformance |
| W.2 | One KaTeX (with mhchem) in the bundle; Paged.js 0.4.3 (locked) is in the bundle once — inside the paged runtime, which the engine carries as a string for the read view and the preview frame. | conformance |
| W.3 | `release.json` is a valid manifest of this release (`kind: paged`, version, formats, notes) whose integrity is the SHA-384 of the bundle's exact bytes; `browser/` and the library's `dist/` hold the same bytes; a build of another version writes that version. | conformance |
| W.4 | In real Chrome the bundle sets `globalThis.OrzCarrier` per FC-19 §2 (`kind: 'paged'`, version, formats `[1]`, `assemble` a promise rejecting what Node throws for, `extract` and `readDocument` the kit's, `mountEditor`, `renderPreview`, `standalone` null) and touches nothing outside a file (no runtime, no storage, no chrome); in the quiet update's sandbox it re-assembles the Node bytes. | real |
| W.5 | The `orz-paged-browser` package: `import` → the ES module, default → the IIFE, `require` → a clear error; its files, `index.d.ts` declaring every runtime export of the ES module and the IIFE's `standalone` handle, and the version in lockstep with `orz-paged`. | conformance |
| W.6 | `renderPreview(text)` gives the content's HTML (the header's version applied, twin links, includes from a record or the app, source anchors), `{ document: true }` a script-free, unpaginated document with the print theme and the page CSS. | real |
| W.7 | Publishing safety: `prepublishOnly` refuses a package whose `release.json` does not match its files (version, kind, integrity). | scenario |
| W.8 | The standalone startup is the kit's `carrier/app`: the entry captures its engine source, then `startCarrier(PAGED_KIND)`; the kind supplies the paged side of the seam (renderer, read view, settings, actions, `newDocument` from a template, repo); the 1.0 code depends on nothing of the 0.x shell (`template.ts`, `app.js`, `browser-entry.ts`, `paged.ts`). | conformance |

## C — the two-column handler (REBUILD §3b decision 1, D-48: the hybrid)

| ID | Claim | Oracle |
|---|---|---|
| C.1 | Over the prototype's 8 documents, laid out by the real engine in real Chrome: every column's text is on the pages in order (continuations included), every option grid whole, the columns side by side, no blank page, nothing below a page bottom except an over-tall image forced onto its page (the documented limit), long blocks split column by column and a short block near a page bottom moved whole; no page errors. | real |
| C.2 | The handler is the prototype's hybrid, ported: registered by the paged runtime, no mode switch, the page area's `column-width` set to `auto` while measuring, a runaway guard (2000 cuts), an over-tall first block forced; a cut is planned on a copy of the source and the kept head checked against the page bottom before it is applied (a theme's frame and trailing space accounted for). | conformance |

## R — the read view: Paged.js pages in the page (rebuild step 4)

| ID | Claim | Oracle |
|---|---|---|
| R.1 | An inline and a cdn file of each of six templates, over `file:` and http, lays the document out as Paged.js pages in `#orz-pages` (in the page, no frame) with the header's page size and title; the paged runtime is injected once; the deferred stylesheets are switched on; no page errors. | real |
| R.2 | Page furniture: running headers and footers and page numbers in the margin boxes; clean front matter (its pages bare, the body renumbered from 1, `--orz-body-pages`); the TOC lists the sections (not the cover's title) with the body number of each heading's page. | real |
| R.3 | Print (the handle's item right after Edit) prints the read view after its layout settles; in print the chrome, the desk, the shadows and the reader's zoom are gone and the pages print as laid out. | real |
| R.4 | A re-render is double-buffered: the old pages stay until the new ones are laid out (never an empty view), the scroll position is kept, the measuring stage goes, and only the latest pagination's styles remain. | real |
| R.5 | The header's `dynamic_choices` decide what the pages show (content for another version is removed before the layout). | real |

## K — the paged items of the handle (spec/carrier-app.md §3.4, REBUILD §3b decisions 2, 3, 6)

| ID | Claim | Oracle |
|---|---|---|
| K.1 | At rest the page shows one control (the pencil); its list: Edit, Print, Save, Download a copy, New document, Save as new copy, Theme, Page size, Template, Page numbers, Number style, Version (only while the document offers versions, following its text), New document from template…, Page zoom. | real |
| K.2 | A setting writes the header (one undoable edit per choice, the document unsaved) and the pages follow (a page size change re-paginates); the saved file is the text's assembly. | real |
| K.3 | New document from template… is a submenu of the 12 templates (the kit's action `items`) and saves a fresh file of the chosen one through the kit's New document (`app.newDocument({ text })`; its skeleton via `newDocument`, `carrier: paged`, a new uid, lint clean, the opened file's delivery); the current text is never replaced. | real |
| K.4 | Version (a kit setting: `choicesFor`, `apply` writing the block value, `hidden` while the document defines no choices) offers each choice key's values and "(not set)"; choosing writes the header's `dynamic_choices` (one undoable edit) and the pages follow. | real |
| K.5 | Page zoom (Automatic, Fit width, 100 %, 125 %; the kit's `readerControls.choices`, key `pageZoom`) is a reader preference by uid (`reader.pageZoom`): the pages scale, the document stays saved and untouched, the choice persists across a reload, Automatic shrinks a page to a narrow window; a save writes the text's assembly only. | real |

## E — the editor with a Paged.js preview (FC-19 §8.4)

| ID | Claim | Oracle |
|---|---|---|
| E.1 | Edit mounts the kit's editor whose sandboxed preview frame runs the paged runtime (`__orzPreviewApply`: pages in `#orz-doc`, scaled to the pane, renders acknowledged when laid out); its toolbar has the paged settings and Version; edit mode links the repository; typing re-paginates, a block keeps its source line inside its page (line → page), a theme change rebuilds the frame. | real |
| E.2 | Edit → type → Save writes exactly `assemble(text)` with the file's delivery and includes — never the live DOM, never a laid-out page — and the file reopens with the text. | real |
| E.3 | Done leaves edit mode and the read view lays out the edited text. | real |

## X — web apps (FD-06)

| ID | Claim | Oracle |
|---|---|---|
| X.1 | The example app (`examples/webapp/index.html`) mounts two paged editors with every FC-19 hook under a nonce CSP: Paged.js pages in the preview frame (the runtime's and Paged.js' styles nonce-stamped), save, undo per instance, resolveAsset, fetchInclude, resolveLink, uploadAsset, ai, mintUid, chrome none driven by the app; no CSP violation, no page error, no update check. | real |
| X.2 | The ES module build mounts the same editor with its Paged.js preview, sets no global, and assembles the Node bytes (inline by default, the engine fetched from jsDelivr). | real |
| X.3 | `docs/embedding.md` covers install and import (ESM and IIFE), every export (with `newDocument`), every hook, the Paged.js preview frame, the CSP recipe (fonts and style attributes included), `renderPreview` not paginated, and versions. | conformance |

## T — the CLI (FC-10, REBUILD §3b)

Since 1.0 the overwrite guards, known states, pair records, backups, atomic
writes, includes, reason codes and `next` are orz-markdown's CLI core
(`orz-markdown/carrier/node`, 2.3.0, its claims N.1–N.9) bound to this tool;
these claims hold for the paged CLI end to end.

| ID | Claim | Oracle |
|---|---|---|
| T.1 | `orz-paged assemble x.paged.md` and `orz-paged x.paged.md` write `x.paged.html` (FC-18 §3 twin name) = the library's `assemble` of the file's exact text — inline by default, `--cdn` for jsDelivr, `-o path`, `-o -` to stdout; the cdn output of the golden text equals the checked-in golden file. | scenario |
| T.2 | `orz-paged new [x.paged.md] [--template id]` writes a lint-clean text twin from the template's starter text (header `kind: document`, `carrier: paged`, a fresh uid, the template's title, `template` and settings, then the given `--title`/`--theme`; default template `note`, legacy names resolve) and with `--html` its assembled file; every template works; without a file it prints the text; it refuses an existing file (`exists`) unless `--force`, which keeps every replaced file — the text twin and the `.paged.html` — as `<file>~`; an unknown theme or template (exit 2, the valid ids named), a name that is not a paged text twin (`x.md`: the message names `x.paged.md`) and another kind's file name are refused. | scenario |
| T.3 | `orz-paged extract x.paged.html` writes the exact text twin: a text made by `new`, saved with CR LF and a BOM, assembled (inline and cdn) and extracted is byte-identical; includes are reported; an island without `#orz-shell` (an unknown writer) and a file cut off inside its island are extracted with a warning (exit 0; `warnings` in `--json`); a 0.x file is refused (exit 1) with the advice to run `upgrade`, and nothing is written. | scenario |
| T.4 | `orz-paged upgrade old.paged.html` writes, in place (or `-o`), the library's `upgrade` of a 0.x file and its text twin (`x.paged.md`, `--text`, `--no-text`), keeping the file's delivery unless `--cdn`/`--inline`; a format-1 file of an older shell is re-assembled with its text and includes; an existing, different text twin is refused before anything is written. | scenario |
| T.5 | `orz-paged inspect <file>` prints a human-readable report (golden) and with `--json` exactly the library's `inspect` report, for 0.x files, assembled files, texts, another kind's text and plain HTML. | scenario |
| T.6 | `themes` marks `DEFAULT_THEME` (`light-academic-1`) and `templates` `DEFAULT_TEMPLATE` (`note`) as the default (human, grouped, and `--json`). Every command answers `--help`/`-h` (and `help <command>`), `--version` (and `--version --json`), prints one JSON object with `--json` (`{ ok: false, error, exitCode }` on failure) and exits 0 (done), 1 (refused or failed: a missing or non-UTF-8 file, a newer text format, an assembled file given to `assemble`, a header naming another carrier) or 2 (usage); `assemble` has no content options: `--theme`, `--title`, `--page-size`, `--lang` are refused with a message that points to the header, and nothing is written; a plain Markdown text `x.md` assembles to `x.paged.html`. | scenario |
| T.7 | Nothing is overwritten that could lose work unless `--force`, which keeps the replaced file as `<file>~`: `assemble` keeps an output that is not an orz file and a `.paged.html` that holds a different text than the one assembled — whichever file is newer — unless that text is a known earlier state of the twin (T.11) (the agent workflow: `new --html`, a browser save, then an edited, newer text twin is refused with advice naming `extract … -o x.browser.paged.md`, `--replaces` and `--force`); the comparison is with the text a new file would store, so mixed line endings assemble twice without a refusal; `extract` keeps a text twin that differs from the file's text — whichever file is newer — unless it is a known state (the text the CLI last wrote or read for the pair, a committed, staged or recent version in git — only when both texts carry the same uid, T.21 — or `--replaces`), with advice naming `extract … -o x.browser.paged.md` (the round-2 repro: `new --html`, an agent edit of `x.paged.md`, a browser save — `extract` no longer overwrites `x.paged.md`); `extract` and `upgrade` never replace a text holding another document (another well-formed uid) with the file's text without `--force` (`output-differs`, no `next`; also not with `--replaces`; a uid `upgrade` mints for a 0.x file says nothing about identity); the output never replaces the input. | scenario |
| T.8 | `assemble` carries the existing output's `#orz-includes` entries for the directives the text still has (`--no-includes` drops them); `--resolve-includes` records the file includes read from the text's folder (exact text), never a path outside it (`../`, absolute, a symbolic link leaving it), keeping the URL entries; every include directive left unresolved is one warning (`warnings` in `--json`) saying the file shows an "Included file not available" note there — with the reason it cannot be read from the text's folder (with or without `--resolve-includes`: a `../outside.paged.md` is `outside-folder`, never "pass --resolve-includes"), the hint to pass it (the user's command with `--resolve-includes`) only when it would be read — and one entry of `unresolved` (`{ target, kind: file|url, reason }`); without `--resolve-includes`, a recorded file include whose file in the folder differs from the record is one warning (`stale-record`, naming that command) and one entry of `stale`. | scenario |
| T.9 | Files are written through a temporary file next to the target and a rename (a new inode; no temporary file left), with the replaced file's mode; a symbolic link stays a link and its target gets the new bytes. | scenario |
| T.10 | Neither `upgrade` nor `assemble` downgrades: a format-1 file whose shell is newer than this tool is refused (`newer-shell`; library: throws unless `{ downgrade: true }`; CLI: unless `--force`, which warns and keeps the old file as `<file>~`); `upgrade` refuses a file cut off inside its `#orz-src` island (`unclosed-island`, advice: `extract … -o <x>.recovered.paged.md`) unless `--force` (which warns and keeps `<file>~`); `upgrade -o` onto another document is refused unless `--force` (which keeps it as `<file>~`); the text twin may not be the input or the output. | scenario |
| T.11 | The smoother assemble rule: `assemble` replaces, without `--force` and without a backup, a `.paged.html` whose text is a known earlier state of its twin — the twin's last committed (`git show HEAD:`), staged (`git show :`) or one of its 20 most recent committed versions (`git log -n 20 -- x.paged.md`, then `git show <sha>:x.paged.md`; a fresh clone with no cache), when it is tracked in git (git only if installed, bounded in time; any failure is "unknown"), or the text the CLI itself last wrote into the file or read out of it for that pair (`new --html`, `assemble`, `extract`, `upgrade`; a SHA-256 of the stored text per pair under `$XDG_CACHE_HOME/orz-paged`, else `~/.cache/orz-paged`); `--json` reports it as `replaced` (`git-head`, `git-index`, `git-log`, `cache`) and `inspect` as `twin.earlier` with advice; mixed line endings compare as stored, with a cache and without one; any other text — notably a browser save made in between — is refused as in T.7, and an unknown cache relaxes nothing. | scenario |
| T.12 | Compare-and-swap for agents without a cache or history: `inspect` (`sha256`, `twin.sha256`), `extract` and `assemble` (`sha256` in `--json`) report the SHA-256 of the text a file holds — for a text twin, of its exact bytes (`sha256sum x.paged.md`); `assemble --replaces <sha256>` replaces a `.paged.html` holding a different text only when that text has the hash (`replaced: "token"`), `extract --replaces <sha256>` only an `x.paged.md` with that hash; any other text is refused (`replaces-mismatch`, nothing written, the current hash named); a token that is not 64 hex digits is a usage error. | scenario |
| T.13 | Machine-readable refusals: every `--json` failure is `{ ok: false, command, error, reason, next?, exitCode }` with a stable `reason` (`bad-usage`, `no-such-file`, `unreadable`, `not-utf8`, `write-failed`, `exists`, `not-orz`, `twin-differs`, `output-differs`, `replaces-mismatch`, `legacy-file`, `newer-shell`, `newer-format`, `unclosed-island`, `other-kind`, `assembled-input`, `invalid-text`, `engine-unavailable`, `failed`) and, where one command resolves it, `next: { command, args }` (`orz-paged <command> <args…>`): a different twin → `extract <file> -o <x>.browser.paged.md`; a 0.x file → `upgrade` (next to a text: `upgrade <file> --text <x>.browser.paged.md`, never `extract`); a cut-off file → `extract -o <x>.recovered.paged.md`. | scenario |
| T.14 | Every output path is guarded like the twin (round 3, F2/F5/L1): the pair record (`x.paged.md` ↔ the `-o` path, keyed by both) and `--replaces` apply to any `-o` output, so the publish loop `assemble w.paged.md -o public/w.paged.html --cdn`, edit, the same command again needs no `--force`; git history relaxes only the twin `x.paged.html`; an `-o` output holding another text is `output-differs` ("another text", `next`: `extract <out> -o <x>.browser.paged.md`), one holding another document (another uid) — at `-o` or at the twin — is `output-differs` ("another document", no `next`), checked before any "only the file changed" advice (round 4, F1); the CLI records each file's last writer (the twin whose pair it last synced the file with: `assemble`, `extract`, `new --html`, `upgrade`), and the message names it when another input wrote the file ("orz-paged last wrote it from b.paged.md"); `--no-includes` is carried like `--resolve-includes` (C20); every suggested command — `next` and the commands in the message — is built from the user's own arguments (`-o`, `--cdn`/`--inline`, `--resolve-includes`/`--no-includes`, extract's `-o`, upgrade's `--text`) and names another-copy files that do not exist yet, never `x.browser.browser.paged.md`; following `next` verbatim and then the named assemble resolves the refusal; missing parent folders of `-o` are created.; git never vouches for an `-o` output or for a text written by `extract -o`/`upgrade --text` to a path other than the file's twin, even with a committed input and a shared uid (M11, M13) | scenario |
| T.15 | `assemble` over an existing file keeps its delivery (cdn stays cdn, inline stays inline) unless `--cdn` or `--inline` is given, as `upgrade` and browser saves do; a new file is inline. | scenario |
| T.16 | Backups are never destroyed: `--force` keeps the replaced file as `<file>~`, or — when `<file>~` holds other bytes, is a symbolic link or anything else — as the first free `<file>~1`, `<file>~2`, … (reported in `backup` / `backups`); a symbolic link at a backup name is never followed or written through (its target is untouched, the link stays) and never counts as the backup, even when its target holds exactly the bytes replaced (`lstat`; C09); a backup already holding the same bytes (a regular file) is reused. | scenario |
| T.17 | Without the pair record: when the cache cannot be written the command warns "pair not recorded (cache not writable …); the next assemble needs --replaces <sha256>" with the hash it printed, and that token works; `assemble`, `extract` and `upgrade` print the `sha256` of the text in their human output — `upgrade`'s is of the text the file holds (as stored: a 0.x source with mixed line endings gives a twin with them and a file without; C19), and it works as `--replaces`; the file-time hint ("changed after it") is left out when both files are clean in git (their times are a checkout's); `--help`, the README and the skill say that a full clone knows the last 20 commits while a shallow checkout needs `--replaces`, and that a text equal to one of the twin's last 20 commits counts as known (commit a deliberate revert first).; a corrupt last-writer record (`files/`) is "unknown", never "no writer" (git then vouches for nothing; M08); a cache the CLI cannot write is read as no cache — its records may be stale (G2) | scenario |
| T.18 | Advice shortcuts: when only the file changed (`x.paged.md` is exactly the CLI's last synced state while its pair is the file's last writer, or — for the twin, with no other writer recorded — committed) and both texts carry the same uid, `assemble`'s refusal names plain `extract x.paged.html` as `next` (`extract <out> -o x.paged.md` for an `-o` output) and following it brings the work in; a legacy 0.x file is resolved by `upgrade … --text x.browser.paged.md`, a merge and `assemble x.paged.md --replaces` with the sha256 upgrade printed — never `--force` (also for `--replaces` mismatches over a 0.x file: `next` is the upgrade); `extract` of a 0.x file names `upgrade <file> --text <x>.browser.paged.md` when `x.paged.md` exists. | scenario |
| T.19 | An empty `.paged.html` is reported as empty (damaged) by `extract` and by `assemble` over it, never extracted as an empty text; a line-ending change in `x.paged.md` is a change: the record holds the twin's exact text, so `extract` refuses to replace an `x.paged.md` whose only change is its line endings, and replaces the exact text it last synced. | scenario |
| T.20 | The comparisons are exact (round 3 mutation survivors): a `--replaces` token must be exactly 64 hex digits (anchored); it is compared in full; `extract --replaces` takes only the hash of `x.paged.md` (not of the file's text), and a mismatching token never falls back to the record; git states compare exactly (`extract`: raw, so a line-ending change is not a committed state; `assemble`: as stored, no trimming); an extract over an `x.paged.md` differing only in trailing white space is refused; the record is keyed by the real paths (a symbolic-link folder and its target are one pair).; on the git branch too, trailing white space and CR LF are differences (`extract` against a committed twin, `assemble` against a file differing only by trailing white space; M23, M26, M28); the uid `upgrade` mints for a 0.x file without one never counts as identity (M21) | scenario |
| T.21 | Every `next` is safe to follow verbatim (round 4, F1; round 5, G1/G2): across scenarios — two inputs publishing to one `-o` (`a.paged.md`, then `b.paged.md --replaces` the hash the refusal names, then `a.paged.md` again; `extract <out> -o a.paged.md`; `upgrade <out> --text a.paged.md`), with a cache that could not record the second write (read-only, c5) or two caches (two users or machines, c6); an input written over another's twin (`y.paged.md -o x.paged.html`, then `x.paged.md`); browser saves in the twin and in an `-o` copy (with a shared uid the shortcut brings them in; uid-less, they are brought out to `x.browser.paged.md`); both sides changed; another document's file copied over the twin (c1–c4: with and without a record of `x.paged.md`'s pair, the copied text with or without a uid, `x.paged.md` committed or not) — with and without uids, with and without git — following each refusal's `next` (never `--force`) until it succeeds loses no text (each text, or a later edit of it, still exists: in an input, an output or a backup), and no text file is replaced by anything but a later edit of its own text. A text is replaced as a known state ("only the file changed", `extract`, `upgrade`) only when both texts carry the same well-formed uid. The limit: texts that share one uid (a copied header, against the rule that a different document needs a new uid) are one document to the CLI — e.g. two such inputs publishing to one `-o` under two caches. | scenario |
| T.22 | The 0.x forms of the command are refused with the 1.0 command that does the same (exit 2, `bad-usage`, `next`), nothing written: `--list-templates` → `templates`; `--new <t> [-o x.md]` → `new x.paged.md --template <t>`; `--template <t>` without a text → `new <t>.paged.md --template <t> --html` (`--cdn` kept); `--template <t>` with a text → put `template: <t>` in its header; following `next` writes what 0.x wrote (the starter text, and its file). | scenario |

## H — the conformance harness (rebuild step 6)

| ID | Claim | Oracle |
|---|---|---|
| H.1 | orz-markdown's carrier conformance harness (`registerConformance`, no `allowSkips`) passes against the real carrier (the harness's default lanes; paged pages paginate, inline files are ~2 MB): all 46 checks of `CHECK_IDS` (C.save.conflict among them) ran in real Chrome and passed, `C.update.from-previous` being not applicable (`firstRelease`: 1.0 is the first release of text format 1 and of `release.json`; 0.x files are upgraded, not updated — owner decision 1), and the final `[conformant]` test is green. No local adaptation: the harness gets the plain browser (orz-markdown 2.2.0 counts only bundle requests, H.7, so the shell head's own stylesheets need no workaround). | conformance |
| H.2 | The harness target is the real carrier: `bundle`/`release` are the library's verified `dist/` engine (= the build = `browser/`), `assemble` is the Node library's, `create` is `newDocument`, `editor` is the opened file's own editor (`OrzCarrier.standalone.edit()`), `protocols` both, `next` this build with the patch number bumped (identical but for its version), `firstRelease: true`, no `previous`. | conformance |

## D — docs and examples (rebuild step 7)

| ID | Claim | Oracle |
|---|---|---|
| D.1 | The committed examples never go stale: every `examples/*.paged.md` has its `examples/*.paged.html`, which extracts to exactly that text, was made by this version, and equals a fresh `assemble` of it with its delivery and includes (several templates inline, one cdn); the texts have a uid and no header lint errors. `npm run examples` regenerates them. | scenario |
