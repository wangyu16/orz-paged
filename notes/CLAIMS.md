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
| B.1 | The package depends on orz-markdown `^2.2.0` and pagedjs `^0.4.3` and builds without shims or aliases: no `build/shims`, no `path-browserify`, no injected `process`, no version `define`; the orz-markdown version comes from `orz-markdown/version` and orz-paged's from `src/version.ts`, never from a `package.json` walk; the engine bundles for the browser as it is. | conformance |
| B.2 | There is one paged theme list (`src/themes.ts`): the stylesheets in `assets/themes` plus `none`, the same ids as the theme fonts, and the default theme is one of them. | conformance |
| B.3 | `VERSION` (src/version.ts, the shell version every file records) equals the package version. | conformance |
| B.4 | No escape helper is copied into the TypeScript sources: they use the kit's `escapeHtml` / `escapeAttr` (`orz-markdown/carrier/read`). (The 0.x file-side `assets/app.js` and the 0.x island escape in `src/template.ts` stay until the engine step replaces them.) | conformance |
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

## L — the 0.x library path (until the engine and CLI steps)

| ID | Claim | Oracle |
|---|---|---|
| L.1 | The 0.x composition (`buildPagedHtml`, `composeInlineHtml`, the CLI) still builds files on orz-markdown 2.2.0, so the repository keeps building between rebuild steps. | scenario |

## A — the isomorphic assembler (FC-18 §2, §8)

| ID | Claim | Oracle |
|---|---|---|
| A.1 | Round trip: `extract(assemble(T, o)).text === T` exactly, for every `paged` corpus file, the 12 template skeletons and every hazard text (CR LF, CR, BOM, astral characters, `</script>` and `<script` in body, header and `custom_css`, element blocks, a settings block in a code fence, `<!--`, no final newline, a 100 kB line, the empty text), for inline and CDN delivery, with and without includes. | corpus |
| A.2 | Determinism: `assemble(T, o)` gives the same bytes on every call and after a fresh module load; the assembler modules use no clock, randomness or environment. | corpus |
| A.3 | Idempotence: `assemble(extract(F).text, o) === F` for every file `F` made with options `o`. | corpus |
| A.4 | Content independence: the shell parts are the same for every text (no document data — no settings, template or page size — in the shell), and the document parts are the same for every delivery and engine. | corpus |
| A.5 | The envelope is the kit's: `#orz-shell` is `{kind: "paged", format: 1, shell: VERSION, delivery}`, the generator is `orz-paged VERSION`, `data-orz-kind="paged"`, the agent banner names `#orz-src` and the orz-paged skill, `#orz-includes` holds exactly the includes given, `<title>`, `lang` and `#orz-meta` come from the header, and the output equals `assembleEnvelope` with this shell's parts (placeholder head and body until the engine step: the `#orz-pages` read view and `#orz-engine`). | scenario |
| A.6 | Delivery: inline puts the given engine source in the file once; CDN references `https://cdn.jsdelivr.net/npm/orz-paged-browser@<VERSION>/orz-paged.browser.js` (the kit's `bundleUrl`) and holds no engine code. | scenario |
| A.7 | `assemble` refuses (throws) a text with NUL or a lone surrogate, a header `format` above 1, an unknown delivery, inline delivery without an engine source, and an engine source that is not script-safe. | scenario |
| A.8 | The assembler modules (`assemble`, `inspect`, `legacy`, `themes`, `version`, `starters`, `sha256`, `doc/settings`, `doc/templates`) import no Node built-in: they bundle for `platform: browser` with nothing external. | conformance |
| A.9 | Browser parity: the assembler bundled for the browser and run in real Chrome writes byte-identical files to Node for every paged corpus file, template and hazard text. | real |
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
