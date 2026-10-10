# orz-paged print themes

Nine print themes, one per light orz-markdown theme and with the same id
(REBUILD §3b guide 3: "each non-dark theme from orz-markdown derives into one
paged theme; as long as the elements suit printed paper, the decoration is
preserved"), plus `none`. The API is documented at the top of `src/themes.ts`;
the themes ship inside the browser engine (`build/bundle.ts`), so an inline
and a `--cdn` file style the same.

| id | label (orz-markdown's) | paper | typefaces |
|---|---|---|---|
| `light-neat-3` | Orchard | `#fbfbf8` | Bricolage Grotesque headings, system sans text |
| `light-neat-1` | Neat | `#ffffff` | Figtree / Source Sans 3 / Fira Code |
| `light-neat-2` | Neat 2 | `#fbfbf8` | Epilogue / Literata / Fira Code |
| `light-academic-1` | Academic | `#fffff8` | Alegreya / Inconsolata |
| `light-academic-2` | Academic 2 | `#fdfdfc` | Fira Sans / Vollkorn / Fira Mono |
| `beige-decent-1` | Beige | `#f4ecdf` | Libre Caslon Display & Text / Red Hat Mono |
| `beige-decent-2` | Beige 2 | `#eee6d8` | Josefin Sans / Cardo |
| `light-playful-1` | Playful | `#fcf9f2` | Indie Flower / Shantell Sans / Recursive |
| `light-playful-2` | Playful 2 | `#fffefb` | Chewy / Patrick Hand |
| `none` | Plain | `#ffffff` | the system serif (`plain/none.css`, hand-written) |

The default theme stays `light-academic-1` (`DEFAULTS.theme`), not
orz-markdown's `light-neat-3`: Orchard sets its text in the system UI font, so
the same document would paginate differently on macOS, Windows and Linux, and
0.x documents without a `theme` key keep the look they had.

## How a theme is made

Generated, committed, never edited by hand:

```
npm run themes            # = npx tsx scripts/build-themes.ts (also run by prebuild / pretest)
npx tsx scripts/build-themes.ts --check   # exit 1 when a generated file is stale
```

Inputs: the INSTALLED orz-markdown (`node_modules/orz-markdown/themes`), so a
theme change there reaches paged on the next build, and this folder's
hand-written layers. Outputs:

- `base.css` = orz-markdown's `common.css` (the structure layer every theme
  shares) adapted for pages, then `layers/structure.css` (the page sheet, page
  breaks, document elements, TOC). Loaded first, for every theme.
- `<id>.css` = the source theme's decoration adapted for paper, then
  `layers/<id>.css` when it exists (the per-theme print layer).
- `src/doc/theme-fonts.ts` = each theme's webfont stylesheets (the source's own
  `@import url(...)`, Google Fonts) and family stacks.

Load order: `base.css`, the theme, then the document's page CSS (which may
override `--page-bg`, `--accent` and the fonts from the header).

Why derive rather than hand-write: the decoration stays the source's, line for
line, so the two cannot drift apart (D-42); what paper changes is a short,
reviewable rule list in one script plus a few lines per theme.

## What paper keeps and what it drops

Kept (decoration that prints): typefaces, sizes, weights, heading styles and
marks, colours, rules and ornaments (printer's rules, asterisms, fleurons,
squiggles, wavy underlines), callout frames, tints and their type marks, table
styling, code panels, quotation styling, badges, list markers, hard offset
shadows and rings (they print as lines), the playful themes' slight rotations,
tape, paper clip and doodles.

Dropped or neutralised (screen-only):

- every `@media` block: viewport queries (a page's width does not depend on
  the window; a 640px rule would re-paginate a document on a phone) and the
  theme's own `@media print` (screen ink-saving, which greys out callouts and
  badges: the opposite of a print theme);
- hover / focus / active / visited states, `::selection`, scrollbars,
  transitions, animations, cursor, smooth scrolling, user-select, backdrop
  filters, sticky / fixed positioning, the screen QR overlay;
- blurred shadows (they print as grey smudges, worst in greyscale);
- viewport sizing: `clamp(…, Nvw, max)` takes its upper bound;
- `html` / `body` rules and the article frame (measure, padding, card,
  border, backdrop): the page margins are the frame and the page sheet is the
  paper (`--page-bg`, the source's paper colour; gradient backdrops and the
  desk-like dot grid of Playful 2 are dropped);
- the neat themes' on-screen modifier classes (`.font-serif`, `.size-lg`, …):
  paged has font presets for that.

Adapted:

- Font sizes in px / rem become em of the theme's body size, so the header's
  `font_size` scales the whole theme and the theme's proportions survive.
  The page settings own the body size and leading (`font_size`,
  `line_height`).
- The source's own variables for the paper, accent and fonts are re-pointed
  at the paged tokens (`--page-bg`, `--accent`, `--font-body`,
  `--font-heading`, `--font-code`), so `page_background`, `decoration_color`
  and `font_preset` restyle a theme the way its author wired it (knock-outs
  follow the paper, rules and marks follow the accent). Element tokens
  `--text-main`, `--text-muted`, `--heading-color` are aliased for paged's own
  elements, and the page furniture tokens `--orz-furniture-font` (the body
  font) and `--orz-furniture-color` (the muted text colour) set the running
  headers, footers and page numbers (`plain/none.css` sets them too).
- Commas inside `:is()` / `:where()` / `:has()` / `:not()` are expanded:
  paged.js splits some selectors on every comma (rules with `display`,
  `break-*`, `page`, `+`) and fails on the pieces.
- From `common.css`, the print rules always apply (tables as tables with
  repeating headers, tabs all shown, things kept whole, QR codes at a
  scannable 2–3 cm); the 640px collapse is dropped. Under Paged.js the
  header repeat itself is the paged runtime's table-head handler
  (`src/paged/table-head.ts`): Paged.js 0.4.3 ignores `table-header-group`.

Per-theme layers (`layers/<id>.css`):

- `light-playful-1`: the exercise book becomes the page, and the ruled lines
  follow the text (owner decision 2026-10-09). Each page's content box is
  ruled from its top, out to the paper edges, at the body leading in absolute
  units (`--orz-grid` = the header's `font_size` × `line_height`), at the
  height where the body font's baseline falls (`--orz-rule-at`, measured by
  the paged runtime's baseline-grid handler, `src/paged/baseline-grid.ts`, so
  any body font and size sits on the lines). Running text (top-level
  paragraphs and lists) is set with exactly that leading and one blank ruled
  line after each block; the handler starts every top-level block on the grid,
  so after a heading, table, callout, code block, formula or image the text is
  back on the lines on every page. Everything else sits on its own paper (an
  opaque background): the rules run behind it, never through its glyphs.
  Inline marks (footnote numbers, sub/superscripts) do not grow a line; a
  paragraph whose line still grows (a tall inline formula) is marked
  `.orz-off-grid` and hides the ruling too. The pink margin line is drawn on
  the page sheet, top to bottom of every page. The title's pink is a shade
  deeper (5:1 instead of 4.4:1 on the cream paper). Checked by
  `tests/ruled-paper.test.ts` (P.9: sampled baselines on three pages against
  the rules; screenshots `/tmp/paged-themes/light-playful-1-aligned-p<n>.png`).

## Decisions

- **Paper prints as shown (WYSIWYG).** The page sheet and everything inside
  the article carry `print-color-adjust: exact`: the PDF looks like the
  preview, tints and badges included, whatever the print dialog's
  "Background graphics" says. For white paper on a home printer, set
  `page_background: white` in the header (knock-outs follow it).
- **Links print as text in the theme's link style**; no URL is appended (it
  would change line breaks and repeat the link a PDF keeps clickable). Write
  the URL as the link text, or in a footnote, when it must survive on paper.
- **Fonts are the source theme's webfonts** (Google Fonts, the same URL
  orz-markdown imports), loaded at view time like every paged font; not the
  `@fontsource` presets, so paged and orz-mdhtml set the same glyphs.
- Readability is checked on the rendered first page: body text and headings
  reach 4.5:1 against what they are printed on, in colour and in greyscale
  (`tests/themes.test.ts`, P.6).

## Known limits

- The title elements (`src/doc/elements.ts`) override the theme's `h1`
  (`font-size`, `color: var(--accent)`, `border-bottom: 0`,
  `padding-bottom: 0`); a theme's positioned `h1` ornament (Beige's printer's
  rule) then overlaps the title text. Owned by the elements; the fix is to let
  the title take the theme's `h1` as it is.
- Playful 1's ruling and Academic 1's callout marks reach into the page
  margin by design; a margin narrower than ~1.5 cm clips them at the sheet
  edge.
- Playful 1's ruling sits under running text only: headings, tables,
  callouts, code, display math, images, columns and lists inside other blocks
  stand on their own paper, so the ruling shows around them, not through them.
  Snapping a block onto the grid adds up to one line of space below the block
  before it. Lines inside one paragraph keep the grid only while no inline
  content grows a line box.
- Orchard's text face is the system UI font, so its line breaks differ by
  platform (as in orz-markdown).

## Checks

`tests/themes.test.ts` (claims P.1–P.8 in `notes/CLAIMS.md`): one theme per
light source theme and the generated files up to date; a forbidden-pattern
list (P.2); paged.js-safe selectors and lossless parsing in Chrome; tokens and
header overrides; a rich sample paginated in real Chrome through paged.js per
theme, fonts loaded, contrast in colour and greyscale; screenshots of each
first page in `/tmp/paged-themes/<id>.png`.
