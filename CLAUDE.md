# CLAUDE.md — orz-paged

Guidance for AI agents working in this repository.

> **orz family:** this repo is one member of the orz family — before changing anything another member depends on, read the family docs via [`../CLAUDE.md`](../CLAUDE.md) (contracts, shared rules, release order, and drift ledger in `../docs/`). The rebuild plan is `../docs/REBUILD.md` §3b (owner design guides and decisions).

## What this is

`orz-paged` is "Markdown that edits itself", laid out as print-ready pages: a
document is its **text twin** (`x.paged.md`, orz text format 1, FC-18, kind
`paged`) and its **self-editing file** (`x.paged.html`) is `assemble(text)` —
one page that shows the document as Paged.js print pages, edits and saves
itself in the browser and prints to PDF (the browser's print; no PDF binary).
Built on the orz-markdown carrier kit ([orz-markdown](../orz-markdown)
`carrier/*`, **`^2.3.0`**): the standalone file's whole runtime is the kit's
`orz-markdown/carrier/app`; this repo supplies the paged kind behind its
`StandaloneKind` seam, the paged runtime (Paged.js 0.4.3, pinned) and the
print themes. orz-mdhtml 1.0 is the reference for everything that is not
pages (CLI, library, conformance, docs).

Two npm packages live here, **versioned in lockstep**:
- `orz-paged` — the CLI and the Node library (this package).
- `orz-paged-browser` — the browser engine and editor component (`browser/`):
  `orz-paged.browser.js` (IIFE, `globalThis.OrzCarrier`, FC-19), the ESM build
  `esm/orz-paged.browser.mjs`, `release.json`, hand-written `index.d.ts`,
  `require.cjs` (a `require()` shim that throws), `docs/embedding.md` (copied).

> **Status:** published 0.7.3; **1.0.0 prepared on branch `rebuild/1.0`**
> (steps 1–7 of REBUILD §3b done: base, isomorphic assembler, engine and
> bundle, the paged kind on `carrier/app`, the 9 derived print themes, CLI
> and library, conformance, docs and examples). Next: the closed loop, then
> the release (orz-markdown 2.3.0 first: it holds every former kit gap, and
> no `KIT GAP` workaround is left here). Claims in `notes/CLAIMS.md` (bound by
> `tests/claims.test.ts`).
>
> **orz-markdown is linked, not installed, until 2.3.0 is published:**
> `node_modules/orz-markdown` is a symlink to the local checkout
> (`rm -rf node_modules/orz-markdown && ln -s ../../orz-markdown
> node_modules/orz-markdown`; do not `npm install` over it — that restores the
> published 2.2.0, which lacks the 2.3.0 API). The bundle resolves the kit's
> dependencies from its real directory (one KaTeX: `build/bundle.ts`).
> **After orz-markdown 2.3.0 is published, refresh the lockfile**
> (`npx npm@11 install orz-markdown@^2.3.0`, which replaces the symlink) and
> rebuild before the release.

## Commands

```bash
npm run build            # prebuild (version, templates, themes) + rm -rf dist + tsc -p tsconfig.build.json (dist/) + npm run bundle
npm run bundle           # build/bundle.ts: the paged runtime, browser/orz-paged.browser.js (bundle rule) + esm/ + release.json,
                         #   and the same IIFE + release.json into dist/ (the Node library's engine)
npm run themes           # scripts/build-themes.ts: the print themes from the installed orz-markdown (also in prebuild/pretest)
npm test                 # vitest: project "main" (unit, corpus, CLI), then "chrome" (real-Chrome files, one at a time), then "conformance"
npm run typecheck        # tsc --noEmit over src, tests, scripts, build
npm run gen -- new x.paged.md --template note   # the CLI from source (tsx src/cli.ts …)
npm run examples         # regenerate examples/*.paged.html from examples/*.paged.md (after a build; D.1 fails when stale)
npm run clean
```

The CLI (`orz-paged --help`; FC-10, inline by default, `--cdn` for the web):

```bash
orz-paged new [x.paged.md] [--template id] [--title T] [--theme id] [--html] [--cdn]
orz-paged assemble x.paged.md [-o out] [--cdn] [--resolve-includes | --no-includes] [--replaces sha256]   # also: orz-paged x.paged.md; a plain x.md → x.paged.html
orz-paged extract x.paged.html [-o out] [--replaces sha256]   # the exact text twin; 0.x files → upgrade
orz-paged upgrade old.paged.html [-o out] [--text t.paged.md | --no-text] [--cdn | --inline]
orz-paged inspect <file> [--json]
orz-paged themes
orz-paged templates
```

`src/cli.ts` holds the commands; the overwrite guards, known states, pair
records, backups, atomic writes, includes, reason codes and `next` are
orz-markdown's CLI core (`orz-markdown/carrier/node`, bound by
`carrierNode({ name: 'orz-paged', kind: 'paged', readLegacy, storedText })`):
every command takes `--json` (one object on stdout), `--help`,
`--force`; exit 0 done / 1 refused or failed / 2 usage. Content (title, theme,
template, page settings, versions, metadata) comes only from the text's
header — `assemble` has no content options; the 0.x forms `--template`,
`--new`, `--list-templates` are refused with the 1.0 command as `next`
(T.22). Files that could hold other work are not overwritten without
`--force`, which keeps the replaced file as `<file>~` (or `~1`, `~2`…). Known
states: git (HEAD/staged/20 recent commits of the twin) and the CLI's pair
records in `$XDG_CACHE_HOME/orz-paged/`, or the caller's `--replaces
<sha256>` (the kit's `sha256`); includes are listed, carried and resolved by
the kit's `includePlan`. Tests point `XDG_CACHE_HOME` at a temporary folder.

Tests live in `tests/` and are bound to the claims in `notes/CLAIMS.md`.
`tests/global-setup.ts` runs `tsc -p tsconfig.build.json` and stages the
engine into `dist/` and `browser/` first (the CLI tests spawn `dist/cli.js`).
The `conformance` project (`tests/conformance.test.ts`, ~6 min of Chrome) runs
orz-markdown's carrier harness against the real carrier after the others (the
harness's default lanes); it must stay conformant (46 checks: 45 pass, `C.update.from-previous` not
applicable — `firstRelease`; no `allowSkips`). Real-Chrome tests skip without
an installed Chrome (playwright-core, channel `chrome`) — such a run verifies
nothing "real". Screenshots: `/tmp/paged-themes/<id>.png` (P.5),
`/tmp/paged-themes/light-playful-1-aligned-p<n>.png` (P.9).

## Architecture

- **Isomorphic core** (no Node built-ins, no clock, no randomness except
  `mintUid`; claim A.8): `src/assemble.ts` (`assemble`, `shellParts`,
  `newDocument` from a template skeleton, `readDocument` with kind `paged`,
  the kit's `extract`), `src/presentation.ts` (header → head links and the
  read view markup), `src/inspect.ts`, `src/legacy.ts` (`readLegacy`,
  `upgrade` of 0.x files: settings block + `kind: meta` → one header),
  `src/themes.ts`, `src/starters.ts` (generated from `assets/templates`),
  `src/version.ts` (generated). The kind-independent pieces (`sha256`, the
  0.x island reader, the `inspect` core) are the kit's (`orz-markdown/carrier`).
- **The document layer** `src/doc/` (reimplemented from orz-md-pdf's model,
  archived in `archive/document-model.md`): `settings.ts` (the header is the
  settings source: `readHeader` → DEFAULTS ← template layer ← header),
  `templates.ts` (12 templates), `elements.ts` (title blocks, abstract, toc,
  letter and CV parts, exam questions), `page-css.ts` (`@page`, margin boxes,
  page numbers, front matter), `dynamic.ts` (versions), `fonts.ts`,
  `theme-fonts.ts` (generated). `src/render-paged.ts` renders a text to the
  runtime's input.
- **Node only**: `src/engine.ts`
  (finds and verifies the engine an inline file carries: `dist/` +
  `release.json`, version and SHA-384), `src/lib.ts` (the package's main
  export; `assemble`/`upgrade`/`inspect` default to that engine),
  `src/cli.ts` (the `orz-paged` bin, on the kit's CLI core
  `orz-markdown/carrier/node`).
- **The paged runtime** `src/paged/` — one IIFE built first and carried by
  the engine as a string (Paged.js is in the bundle once): `runtime.ts`
  (`__orzPaged.paginate`: stage, enhancement, Paged.js into an off-screen
  buffer, swap; front matter, TOC page numbers, copy-as-Markdown; the editor
  preview frame's `__orzPreviewApply`), `cols-flow.ts` (the hybrid two-column
  handler, D-48), `baseline-grid.ts` (a theme's page ruling under the text:
  `--orz-grid` / `--orz-rule-at`, every top-level block placed on the grid —
  light-playful-1 opts in; its ruling is the page box's `::before`, never a
  positioned `.pagedjs_area`), `input.ts`. The runtime is built without
  css-tree's validation data (build/bundle.ts `noCssTreeData`).
- **Browser engine** `src/browser/`: `index.ts` (the IIFE: captures its
  engine source, then the kit's `startCarrier(PAGED_KIND)`), `esm.ts`,
  `carrier.ts` (the FC-19 API), `paged/` (the kind: `kind.ts`, the read view
  `read-view.ts` with Paged.js pages in the page, `settings.ts`, `actions.ts`
  (Print; New document from template…, a submenu), the Version setting in
  `settings.ts` (`choicesFor` / `apply` / `hidden`), the Page zoom reader
  control in `kind.ts` (`readerControls.choices`, `zoom.ts` scales the
  pages), `preview.ts` (the editor's Paged.js preview frame), `render.ts`,
  `versions.ts`).
- `build/bundle.ts` — esbuild → the runtime, the IIFE/ESM, the bundle rule,
  `release.json`; `buildBrowser({ version })` builds in memory (tests, the
  conformance `next`).
- `scripts/build-themes.ts` — the print themes (`assets/themes/*.css`,
  generated, committed, never edited by hand) from the installed
  orz-markdown's light themes plus `assets/themes/layers/*.css` (hand-written
  print layers). See `assets/themes/README.md`.
- `examples/` — `exam.paged.md`, `notebook.paged.md` (inline) and
  `letter.paged.md` (cdn) with their files (D.1); `examples/webapp/` +
  `docs/embedding.md` — the app embedding path (X.*).
- `orz-paged-skills/SKILL.md` — the agent skill; `PROTOCOL.md` — a pointer to
  orz-markdown `spec/host-protocols.md` plus the paged deltas (shipped).
- `archive/` — the 0.x design documents (DESIGN, plans, the orz-md-pdf model,
  the 0.x DOM contract), with a README saying what is still true and where.
- Legacy 0.x fixtures (for `upgrade`/`inspect`) in `tests/fixtures/legacy/`;
  CLI goldens in `tests/fixtures/cli/`.

## Conventions & gotchas

- **The text is the document; never serialize the live DOM or the laid-out
  pages.** Every save, update, "New document" and "Save as new copy" writes
  `assemble(text)`.
- **Print-first, light paper only** (owner): no dark themes; dynamic
  constructs (tabs, spoilers, video) are discouraged, not forbidden. Templates
  own layout, themes own the look; a header key overrides both. Page break =
  `::: page-break`. Do not reopen these without the owner.
- **A layout must never block typing or keep the page blank** (closed loop
  round 1): the editor preview paginates only after a typing pause
  (`debounceMs` 1.5 s, `maxWaitMs: Infinity`, frame-acknowledged — E.4);
  anything run per pause (a setting's `hidden`, `current`) is a cheap text
  test, never a render (K.6); the runtime waits at most `FIRST_WAIT_MS` (2 s)
  for fonts and libraries, then lays out and re-flows once when they arrive
  (R.6).
- **Paged.js is pinned at 0.4.3**: the two-column handler, the baseline grid
  and the nonce stamping hook into its internals; a bump needs the column
  regression (C.1) and the ruled-paper check (P.9) green.
- **Node and the browser write the same bytes** (FC-18 law 2): the Node
  library inlines exactly the bundle `npm run bundle` staged in `dist/`; a
  stale engine is refused ("run `npm run bundle`"), never inlined.
- **The browser bundle embeds orz-markdown** (and the print themes). To pick
  up parser, kit or theme changes: bump `orz-markdown`, `npx npm@11 install`
  (npm 10 fails to install vitest here), `npm run build`, `npm run examples`.
- **`dist/`, `browser/orz-paged.browser.js`, `browser/esm/`,
  `browser/release.json` and `browser/docs/` are gitignored** build
  artifacts; the examples (`examples/*.paged.html`) are committed.
- **Bundle rule** (orz-markdown spec/shell-runtime.md §6): the bundle and the
  runtime hold no `<script`/`</script`, no CR, only ASCII; the build rewrites
  `<` as `\x3C`, checks, then computes the SHA-384.
- **Kit gaps** are worked around locally behind a `KIT GAP` comment and
  reported, never patched in orz-markdown from here (none is open: 2.3.0
  closed them all).
- Reading and editing work in all modern browsers; **Save in place only in
  Chromium** (File System Access; elsewhere Save downloads).

## Releasing (two packages, same version)

1. Bump **both** `package.json` and `browser/package.json` to the same
   version; date the CHANGELOG entry.
2. `npm run build`, `npm run examples`, `npm test` (twice green, conformance
   included).
3. `cd browser && npm publish` (orz-paged-browser; its `prepublishOnly` runs
   `scripts/check-release.mjs`) **first**, then `npm publish` in the root.
4. Token: granular with bypass-2FA in a temp `.npmrc`, deleted after; never
   commit.
5. **Network note**: IPv6 is unreliable on this machine — prefix npm/git
   network commands with
   `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"`.
6. Regenerate the website starter (orz-markdown `docs/starters/`) and sync the
   plugin skill mirror with the release.

## After each major revision

Check coherency and update the README, the skill, CLAUDE.md, the CHANGELOG
and the examples. Stale docs are bugs. Before each publishing, update the
example dual-extension files to the current version.
