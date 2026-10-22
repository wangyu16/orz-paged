# D-82 — `orz-paged inspect --layout` (design note, not built)

Status: proposal for 1.1 or later (2026-10-22). The request: an agent cannot
check a paged document's layout — page count, overflow, blocks moved to the
next page — and a blind newcomer took five rounds to fit one page by hand.

## Why not built in this pass

- The working part is the browser driver, not the measurement. orz-slides
  1.0 has one (`src/layout-report.ts`, ~330 lines: find an installed Chrome
  or `ORZ_SLIDES_CHROME`, a fresh profile, DevTools protocol over
  `--remote-debugging-pipe`, no new dependency, `no-browser` refusal,
  `--offline`). Copying it into a second carrier makes two drivers to keep
  in step. **Recommendation:** move the driver into the kit
  (`orz-markdown/carrier/node`: `findChrome`, `openInChrome(html, { offline })`
  → a page handle with `evaluate`/`close`), then both carriers keep only
  their measurement. That is a kit change (owner, kit release first; RULES
  §3 order).
- Without a real-Chrome lane exercising it end to end (as T-lane tests do for
  the CLI), a layout report would be an unverified claim.

## What paged would report

Run: assemble the text inline with this release's engine (as `assemble`
does), open it headless at a fixed viewport, wait for the read view to be
final — `OrzCarrier.standalone.view.idle()` (fonts, libraries, the one
re-flow after late fonts, R.6/R.17) — then read `__orzPaged.stats()` and
the page DOM. Nothing is written.

| field | from | meaning for the author |
|---|---|---|
| `pages` | `#orz-pages .pagedjs_page` count | "fit to N pages" |
| `pageSize`, `margins` | resolved settings | what the count is measured against |
| per page `fill` | last content box bottom ÷ area height | how much room is left (the last page's fill says how far from one page less) |
| `overflow` | a block whose box ends below `.pagedjs_area` or is wider than its column/area (`scrollWidth > clientWidth`): tables, code, images, formulas | content cut off in print |
| `moved` | the runtime's stats: tables moved whole (P.11), code lines moved (R.12), blocks the column handler moved whole (C.*), headings kept with what follows | white space the author did not write |
| `tallBlocks` | blocks taller than one page area (split by force) | candidates for `::: page-break` or smaller type |
| `provisional` | a layout that gave up on a font/library (R.13) | the count may change on a machine with the fonts |
| `errors` | page errors | |

Human output: one line per page (`p3  92 % full  moved: table "Results" (whole)`),
then a summary and advice in user words (`2 pages; the last is 18 % full —
font_size 10.5 or margins 18mm would likely fit 1 page`). `--json`: the
object. Exit 0 always when it rendered (a report, not a verdict); `1` with
reason `no-browser` without Chrome.

## Tests it would need

- Unit: the advice text from a synthetic stats object.
- Real Chrome: the corpus' one-page note is `pages: 1`; a 3-page fixture
  with a table that moves whole reports it in `moved`; a too-wide table in
  `overflow`; `--offline` reports `provisional` when a webfont is held.
- Until then the skill's recipe (headless Chrome PDF page count) stays the
  documented way.
