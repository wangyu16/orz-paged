# orz-paged

**Markdown that edits itself — laid out as print-ready pages.**

A document is its **text twin** — `report.paged.md`, plain Markdown with a
small header — and its **self-editing file** `report.paged.html`, one HTML
page that shows the document as real print pages (A4, Letter…, margins,
running headers and footers, page numbers), edits itself in the browser,
saves back in place and prints to PDF from the browser (no PDF binary, no
Puppeteer). The file is always `assemble(text)`: the text inside it is the
document; everything else is a shell that can be regenerated. Built on the
carrier kit of [orz-markdown](https://www.npmjs.com/package/orz-markdown)
(`^2.3.0`; orz text format 1) and [Paged.js](https://pagedjs.org/) 0.4.3.

The paginated sibling of [orz-mdhtml](https://www.npmjs.com/package/orz-mdhtml)
(a continuous, themed web page) and orz-slides (a deck): the same text twin,
the same pencil, editor, saves, quiet update, host protocols, CLI and agent
workflow; what paged adds is pages.

## What a 1.0 `.paged.html` is

- **The text twin inside.** The exact text (BOM and line endings kept) rides
  in the file's `<script type="text/markdown" id="orz-src">` island.
  `orz-paged extract` gives it back byte for byte; an agent banner at the top
  of `<body>` tells tools how to read it.
- **Pages, in the page.** The document is laid out by Paged.js as print pages
  right in the page (no frame): the header's page size, margins, theme and
  typography; running headers and footers and page numbers in the page
  margins, in the theme's body font and muted colour; long tables broken
  between rows with their header row repeated on each page (a row taller than
  a page breaks inside, under the header; the rest of it continues on the next
  page without one; a cell's unbreakable content wider than the page runs
  past its edge); long code broken between lines; title pages,
  an abstract and a table of contents with the page number of each section; clean front matter (title, abstract and contents
  pages without furniture, the body numbered from 1). What you see is what
  prints.
- **One quiet control.** The page shows a small pencil at the bottom-left.
  Click it to edit; hover it (tap it on a touch screen, or Tab to it and press
  ArrowUp) for the list of everything else — **Edit, Print, Save, Download a
  copy, New document, Save as new copy**, the settings **Theme, Page size,
  Template, Page numbers, Number style**, **Version** (while the document
  offers versions), **New document from template…** and **Page zoom**, and,
  when there is one, the update. A dot on the pencil means unsaved changes.
- **Print.** *Print* (right after Edit) prints the read view once its layout
  has settled: the pages print as laid out, without the pencil, the grey desk
  or the zoom. Choose *Save as PDF* in the print dialog for a PDF.
- **Settings are the document's.** Theme, page size, template and page
  numbers live in the text's header: choosing one from the pencil's list (or
  the editor's bar) writes the header — one undoable edit, the document unsaved
  until you Save — and the pages follow. Margins, fonts, running headers and
  footers and custom CSS stay in the header text.
- **Versions (one source, several printouts).** A header's `dynamic_choices`
  (e.g. `answer-key: hide`) decides what the pages show; *Version* switches it
  (an exam with or without its answers) — again a header edit. Version is
  offered also when versioned content arrives through an include
  (`{{md part.md}}`).
- **Page zoom.** *Page zoom* (Automatic, Fit width, 100 %, 125 %) scales the
  pages for reading. It is your preference, not the document's: kept in this
  browser for this document (by its `uid`), never saved into the file, and it
  never changes pagination (a text-size control would): the pages are always
  laid out at 100 % and scaled only when the layout has ended, so a narrow
  window shows — and prints — the same pages as a wide one (the editor's
  preview, scaled to its pane, too).
- **Templates.** *New document from template…* lists the twelve templates and
  saves a fresh file of the chosen one (its starter text, a new `uid`, named
  `<template>.paged.html` in the save dialog); the
  current document is never replaced. A header's `template:` key sets layout
  defaults only (the page size); the pencil's *Template (page size)* item
  changes only that key — its choices name the template and the page size it
  sets (`report-page — Letter`); switching adds no title page or content.
- **Edit.** The pencil (or Cmd/Ctrl+E) opens the editor: CodeMirror beside a
  live preview of the pages (split, editor or preview mode; the preview scales
  the pages to its pane), the paged settings and
  *Version* in its bar, undo per document. **Done** goes back to the read view.
  The bar ends, quietly, with the orz seal (https://markdown.orz.how) and this
  tool's GitHub link. Print from the read view, not the editor preview
  (Cmd/Ctrl+P while editing — in the editor or in its preview — leaves the
  editor and prints the pages of the current text; Print and Cmd/Ctrl+P wait
  for the final layout, "Preparing pages… (n of N)" meanwhile; pressing again
  while it waits opens no second dialog). The preview follows about a second
  after you stop typing: it lays out again from the page your edit changed
  (the pages before it are kept) and swaps each new page in as it is ready,
  so the edited page shows one to two seconds after the last key even on a
  35-page report; the rest of a long document follows within a few seconds.
  Typing again stops that layout, so typing never waits for it. While the
  preview is behind the text it shows a quiet "updating…" mark (so does the
  read view while it lays the pages out again, e.g. after Done). A file opens
  with a quiet "Laying out pages…" line and shows its pages one by one as they
  are laid out.
- **Save, New, Copy.** **Save** (Cmd/Ctrl+S) writes `assemble(text)` — never
  the laid-out pages — back to the file. A save never silently overwrites a
  file that changed on disk since the page opened it: it asks — *Replace it*
  or *Download a copy instead*. The page asks before it closes with unsaved
  changes.
- **A quiet update.** A local file checks, at most once a day, whether a newer
  release of its engine exists; if so, the pencil gets a small dot and its list
  offers *Update to x.y.z*. *Update now* re-assembles the same text with the
  new release (its bundle verified by SHA-384) and saves it; nothing changes
  until the reader asks. Served pages, framed pages and pages with a host
  never check.

Paged is for documents in print view: dynamic constructs (tabs, spoilers,
embedded video) are discouraged, not forbidden; everything else is
orz-markdown — math, code, Mermaid diagrams, chemistry (SMILES), charts, QR
codes, tables, callouts, footnotes, columns.

Content — title, theme, template, page settings, versions, author, licence —
comes only from the text's header:

```markdown
{{nyml
kind: document
carrier: paged
uid: doc-7kq2m9x4p1r8s3t5
title: Chemistry 101 — Exam 1
template: exam-page
theme: light-academic-1
page_size: Letter
page_number_style: page-n-of-N
dynamic_choices: |
  answer-key: hide
}}
```

With no `title` in the header, the title is the first level-1 heading, else
the first title element's; with neither it is `Untitled` — by the CLI and in
the browser alike, never after the file name.

Examples (each text twin with its file): [`examples/exam.paged.md`](https://github.com/wangyu16/orz-paged/blob/main/examples/exam.paged.md)
→ [`exam.paged.html`](https://github.com/wangyu16/orz-paged/blob/main/examples/exam.paged.html) (an exam with an answer-key
version, inline), [`examples/notebook.paged.md`](https://github.com/wangyu16/orz-paged/blob/main/examples/notebook.paged.md) →
[`notebook.paged.html`](https://github.com/wangyu16/orz-paged/blob/main/examples/notebook.paged.html) (the Playful theme's ruled
paper, inline), [`examples/letter.paged.md`](https://github.com/wangyu16/orz-paged/blob/main/examples/letter.paged.md) →
[`letter.paged.html`](https://github.com/wangyu16/orz-paged/blob/main/examples/letter.paged.html) (a letter, a small cdn file for
the web).

## Templates and themes

Twelve **templates** (`orz-paged templates`): `article-page`,
`article-section`, `report-page`, `report-section`, `exam-page`,
`exam-section`, `letter`, `cover-letter`, `cv`, `cv-modern`, `cv-elegant`,
`note` (the default). A template is a starter text (its header and a skeleton, which `new --template` writes)
plus a layout default (the page size: Letter, A4 for `note`). The `-page` starters put the
title on its own page; `article-page` and `report-page` also write
`front_matter: clean` into the header (`exam-page` does not); the
`-section` starters use an inline title block. The header's `template:` key
alone sets only that page size (a `page_size` key wins) — it adds no title
page, furniture or content and does not turn on clean front matter
(`front_matter_clean: yes` is an older spelling of `front_matter: clean`). The 0.x names `article`, `report`, `exam` resolve to the `-section`
variants.

Nine **print themes** (`orz-paged themes`): one derived from each light
orz-markdown theme — `light-neat-3` (Orchard), `light-neat-1`, `light-neat-2`,
`light-academic-1` (the default), `light-academic-2`, `beige-decent-1`,
`beige-decent-2`, `light-playful-1` (a ruled notebook: text, headings and formulas
written on the lines, tables, code and callouts pasted on as sheets), `light-playful-2` — plus `none` (plain). Each keeps its source
theme's typefaces and decoration wherever they suit paper and drops what is
screen-only; the header's `font_preset`, `decoration_color` and
`page_background` restyle a theme. The themes ship inside the engine, so a
`--cdn` file styles exactly like an inline one. Details:
[assets/themes/README.md](https://github.com/wangyu16/orz-paged/blob/main/assets/themes/README.md).

## Two columns

`:::: cols` with `::: col` blocks lays text side by side. Across a page break
a **short** block (one that fits on a fresh page) moves whole to the next
page when that leaves less than about a third of the page empty; otherwise —
and for a **long** block — it is split column by column at the page bottom
(column 1 continues in column 1 on the next page). The third holds for every
move: a block whose column would keep nothing on the page (its first block an
image, say) moves whole only below it — above it, that column continues on
the next page while the others split. A table splits too, between rows, its
header repeated: a column that opens with a table keeps it on the page when
its header and first row fit. A heading never ends a column's part on a page
(it goes on with what it heads). Limits: a lone long column stays narrow;
only paragraphs, list items, blockquotes, plain blocks and tables split —
images, figures, code, math, headings and boxed asides move whole; a block
that no cut can place (a table row, or code, taller than a column page) is
laid out as plain flow, its columns one after the other; a table wider than its column
(long unbreakable words in many cells) overflows it; a one-line widow is
possible; a block taller than a page is clipped at the bottom.

## Install

Node 20.16 or newer. Run the CLI with `npx` (nothing to install) or install
it:

```bash
npx orz-paged@1 new report.paged.md --template report-page --title "Q3 Review"   # a new text twin
npx orz-paged@1 report.paged.md                                                # → report.paged.html
npm i -g orz-paged@1                                                           # or: the orz-paged command
```

For a web app, the browser engine and editor component:
`npm i orz-paged-browser@1` (see [In web apps](#in-web-apps)).

## The CLI

```
orz-paged new [file.paged.md] [--template id] [--title T] [--theme id] [--html] [--cdn | --inline]
orz-paged assemble <file.paged.md> [-o out.paged.html] [--cdn | --inline] [--resolve-includes | --no-includes] [--replaces sha256]   (also: orz-paged <file.paged.md>)
orz-paged extract <file.paged.html> [-o out.paged.md] [--replaces sha256]
orz-paged upgrade <old.paged.html> [-o out.paged.html] [--text out.paged.md | --no-text] [--cdn | --inline]
orz-paged inspect <file> [--json]
orz-paged themes
orz-paged templates
```

| Command | What it does |
|---|---|
| `new` | writes a new text twin from a template's starter text: its header with `carrier: paged`, a fresh `uid`, the template's settings and the given `--title` / `--theme`, then its skeleton body (default template `note`). `--title` also replaces the template's placeholder title where the starter repeats it (its title block or first heading, a running header such as report-page's `header_center`). With `--json`, `theme` is the header's (null when absent) and `themeEffective` the theme the pages use. `--html` also assembles it; without a file name the text goes to stdout. A paged text twin's name ends in `.paged.md`. |
| `assemble` | writes `x.paged.html` (or the `-o` path; missing folders are created) from `x.paged.md` (exact text in, the same bytes every time). A plain Markdown text `x.md` assembles to `x.paged.html` too. Keeps the delivery and the includes the existing file holds (`--cdn` / `--inline` choose the delivery); `--resolve-includes` reads file includes from the text's folder. An include left unresolved shows an "Included file not available" note in the file and is reported once with why (a warning, and `unresolved` in `--json`); a recorded include whose file has changed since is a warning too (`stale` in `--json`). |
| `extract` | writes the exact text twin of an assembled file (`x.paged.html` → `x.paged.md`) and reports its includes. Replaces an existing, different `x.paged.md` only when it is a known state (below). A 0.x file is refused with the advice to run `upgrade`; a cut-off file gives a warning. |
| `upgrade` | turns a 0.x file (or a file of an older 1.x shell) into a file of this version, in place by default, and writes its text twin (`x.paged.md`) unless `--no-text`. Keeps the file's delivery unless `--cdn` / `--inline`. Repairs a damaged engine; refuses (unless `--force`) to downgrade a newer shell or to upgrade a file cut off inside its text. A 0.x file upgraded in place is kept as `old.paged.html~`. |
| `inspect` | diagnoses a text or a file of any version: kind, text format, shell version and how it compares to this tool, delivery, uid, title, theme, template, the paged settings, header keys, lint (an unknown theme; a value an enumerated key such as `page_number_style` or `page_size` does not take: `invalid-value`), the file's structure (cut off? engine intact?), the SHA-256 of the text it holds, whether the sibling twin (`x.paged.md` ↔ `x.paged.html`) holds the same text (and that text's SHA-256) and which is newer, and advice in plain sentences naming the files. |
| `themes` | lists the print theme ids a header may name (the default marked). |
| `templates` | lists the templates by group (the default marked). |

**Delivery.** Files are **inline** by default: the browser engine (with
Paged.js and the print themes) is inside the file (about 1.7 MB), so it opens
without fetching the engine. `--cdn` writes a small file that loads the engine
from
`https://cdn.jsdelivr.net/npm/orz-paged-browser@<version>/orz-paged.browser.js`
(the file's own version, e.g. `orz-paged-browser@1.0.0`) — for pages you
publish on the web. Either way the webfonts, KaTeX's and highlight.js's
styles, the content libraries (Mermaid, SMILES, Chart.js) and the editor
(CodeMirror) load from CDNs: laying out styled pages and editing need a
network connection the first time. A slow or unreachable CDN never holds the
page blank: the pages are laid out after at most 2 s of waiting for fonts,
stylesheets and libraries — with fallback fonts and unenhanced content if
they have not arrived — and laid out once more when they do (the scroll
position kept; Print waits for that final layout). **Inline is not
offline**: with no network the pages are laid out in fallback fonts (page
breaks can differ from a networked print), formulas unstyled and diagrams,
molecules and charts missing.

**Checking the layout.** The CLI does not lay pages out: `inspect` reads
the text and the file, and has no `--layout` (that is orz-slides). Count
pages by printing to PDF with headless Chrome (`--headless=new
--virtual-time-budget=20000 --print-to-pdf=x.pdf file:///…/x.paged.html`)
or, in an open file, `document.querySelectorAll('.pagedjs_page').length` in
the console; the skill has a "fit to N pages" recipe.

**0.x commands.** `orz-paged --template <t>`, `--new <t>` and
`--list-templates` are refused with the 1.0 command that does the same
(`orz-paged new <t>.paged.md --template <t> --html`,
`orz-paged new x.paged.md --template <t>`, `orz-paged templates`); `--title`
and `--theme` on `assemble` are refused with a pointer to the header.

**For scripts and agents.** Every command takes `--json` (one JSON object on
stdout), `--help` and `--force`. Exit status: 0 done, 1 refused or failed, 2
usage error. `assemble` has no content options. Nothing that could hold other
work is overwritten without `--force`: an output that is not an orz file, a
`.paged.html` that holds a different text than the one being assembled (it
may hold work saved in the browser — whichever file is newer), an
`x.paged.md` that differs from the text being extracted (it may hold edits —
whichever file is newer), unless what is replaced is a known state (below); a
file made by a newer orz-paged; another document (`upgrade -o`); or (for
`new`) any existing file. With `--force` the replaced file is kept as
`<file>~` — or, when that name is taken by something else, `<file>~1`,
`<file>~2`, … (a backup is never overwritten, and a symbolic link at a backup
name is never followed). Files are replaced through a temporary file and a
rename, keeping their mode; a symbolic link stays a link. `assemble`,
`extract` (to a file), `inspect` and `upgrade` print the `sha256` of the text
they wrote or read, and every `--json` result that wrote a text carries it
(`new` prints it only with `--json`; `themes` and `templates` never).

**Known states.** `orz-paged assemble x.paged.md` replaces `x.paged.html` (or
the `-o` output) without `--force` when the file holds the same text, or **an
earlier state of `x.paged.md`** the CLI can prove; `orz-paged extract
x.paged.html` replaces `x.paged.md` when `x.paged.md` itself is a known state:

- (for `x.paged.html` and `x.paged.md`, not another `-o` path) a committed
  version of `x.paged.md` — its last commit (`git show HEAD:x.paged.md`), its
  staged version, or one of its 20 most recent commits (`git log -n 20 --
  x.paged.md`) — when it is tracked in git (git is used only if installed, for
  a few seconds at most; any failure counts as unknown). A full clone knows
  what its history holds; a shallow checkout (CI's default `--depth 1`) knows
  only its last commit — use `--replaces <sha256>` there. A text equal to one
  of the twin's last 20 commits counts as a known earlier state, so a
  deliberate revert of the other file to such a text is replaced — commit the
  revert first;
- the text `orz-paged` itself last wrote into the output or read out of it,
  for that pair (`new --html`, `assemble`, `extract`, `upgrade` record a
  SHA-256 of the file's text and of the twin's exact text per pair — the text
  and the output path, `-o` included — in `$XDG_CACHE_HOME/orz-paged/`, else
  `~/.cache/orz-paged/`; the record only lifts a refusal when the text hashes
  to exactly that value; a line-ending change is a change) — and, for
  `extract` (and the "only the file changed" advice), only while that pair is
  the last the CLI synced the file with. Another document (another uid) is
  never replaced this way. When the record cannot be written (a read-only
  cache), the command warns: the next assemble needs `--replaces` with the
  hash it printed;
- **`--replaces <sha256>`** — a portable compare-and-swap for agents in a
  fresh sandbox (no cache, no history): `inspect --json` prints `sha256` (the
  text the inspected file holds; for a text, the SHA-256 of its bytes, as
  `sha256sum`) and `twin.sha256` (the sibling's); `extract` and `assemble`
  print the `sha256` of the text they wrote. `assemble x.paged.md --replaces
  <h>` replaces `x.paged.html` only while its text has hash `h`; `extract
  x.paged.html --replaces <h>` replaces `x.paged.md` only while it has hash
  `h`. Any other text is refused (`replaces-mismatch`).

So the normal loop — edit `x.paged.md`, assemble, edit, assemble — needs no
`--force`, with or without `-o`. The one robust idiom, with no cache, no git,
in a shallow clone: pass the `sha256` the last command printed as
`--replaces`. Anything else is refused: notably a save in the browser made in
between, or an `x.paged.md` edited since the CLI last synced the pair.
A known state says that a text is unchanged — never that the file beside it
holds the same document; so a text is replaced as a known state only when both
texts carry the same `uid` (`new` writes one; keep it).

**Refusals, for machines.** A `--json` failure is
`{ "ok": false, "command", "error", "reason", "next"?, "exitCode" }`. `reason`
is a stable code; `next` (when one command resolves it) is
`{ "command", "args" }` — run `orz-paged <command> <args…>`. Every command a
refusal suggests is built from your own arguments and names a copy
(`x.browser.paged.md`, `x.browser-2.paged.md`, …) that does not exist yet:

| `reason` | Meaning | `next` |
|---|---|---|
| `bad-usage` | unknown option, missing argument, options that exclude each other, a 0.x form (exit 2) | the 1.0 command, for a 0.x form |
| `no-such-file`, `unreadable`, `not-utf8` | the input cannot be read as UTF-8 text | — |
| `exists` | `new`: the file exists | — |
| `not-orz` | the output exists and is not an orz file; or the input holds no orz document | `inspect <file>` |
| `twin-differs` | the twin holds a different text that is not a known state (`assemble`: `x.paged.html`; `extract`, `upgrade`: `x.paged.md`), or a known state without a shared uid | `extract x.paged.html -o x.browser.paged.md` (only the file changed and a shared uid: `extract x.paged.html`; a 0.x file: `upgrade x.paged.html --text x.browser.paged.md`) |
| `output-differs` | an `-o` output holds another text than the one this pair last had there, or any output holds another document (another uid: choose another path) | `extract <out> -o x.browser.paged.md`; none for another document |
| `replaces-mismatch` | `--replaces`: the file no longer holds the text with that hash | `extract x.paged.html -o x.browser.paged.md` |
| `legacy-file` | a 0.x file: `extract` cannot read it; `assemble` will not replace it | `upgrade x.paged.html` (next to a text: `--text x.browser.paged.md`) |
| `newer-shell` | the file was made by a newer orz-paged (use `npx orz-paged@latest`) | — |
| `newer-format` | the text's format is newer than this tool writes | — |
| `unclosed-island` | `upgrade`: the file was cut off inside its text | `extract x.paged.html -o x.recovered.paged.md` |
| `other-kind` | an orz md/slides document: by its file name (`x.slides.md`, `x.md.html`, …), or a plain `x.md` whose header says `carrier: md` / `slides` (an `x.paged.md` with another `carrier` is assembled as paged, with the lint warning `carrier-mismatch`): use its own tool | — |
| `assembled-input` | `assemble` was given a `.paged.html` | `extract x.paged.html` |
| `invalid-text` | the text cannot be assembled (NUL, a lone surrogate…) | — |
| `engine-unavailable` | the inline engine is missing or stale (source checkout: `npm run bundle`) | — |
| `write-failed`, `failed` | an output (or its `~` copy) could not be written; anything else | — |

`assemble --json` lists the includes left unresolved as `unresolved: [{
target, kind: "file" | "url", reason }]` (`not-recorded` — pass
`--resolve-includes`; `url` — the CLI fetches no URLs; `no-such-file`,
`outside-folder`, `unreadable`, `not-utf8`, `folder-unreadable`) and the
recorded file includes whose file has changed since as `stale`.
`inspect --json`'s `twin` is `{ name, holds: "same" | "different" | "none",
newer, sha256, earlier? }`, or `null` when the sibling does not exist
(inspect the file that exists: `inspect x.paged.md` with only
`x.paged.html` fails with `no-such-file`).

**Editing an existing document (the safe loop).** Before you edit
`x.paged.md`, run `orz-paged inspect x.paged.md`: if it says `x.paged.html`
holds a different text (and not an earlier text of `x.paged.md`), someone
saved in the browser — `orz-paged extract x.paged.html -o x.browser.paged.md`,
merge it into `x.paged.md`, then `orz-paged assemble x.paged.md --replaces
<twin.sha256>`. Only when the text has everything, `orz-paged assemble
x.paged.md --force` (the old file is kept as `x.paged.html~`).

## The library

```ts
import { assemble, extract, readDocument, newDocument, inspect, upgrade, TEMPLATES, THEMES } from 'orz-paged';

const text = newDocument({ template: 'exam-page', title: 'Midterm', theme: 'light-academic-2' });
const html = assemble(text);                     // inline (this release's engine); { delivery: 'cdn' } for the web
extract(html)?.text === text;                    // true: the exact text back
readDocument(text).title;                        // 'Midterm' (header and derived facts, no rendering)
inspect(html).advice;                            // what to do next, for any version
upgrade(oldHtml);                                // { text, html, from, moved, notes } for a 0.x file
```

Exports: `assemble`, `extract`, `readDocument`, `newDocument`, `storedText`,
`inspect`, `upgrade`, `readLegacy`, `readSettings`, `resolveSettings`,
`SETTING_DEFAULTS`, `TEMPLATES`, `TEMPLATE_IDS`, `DEFAULT_TEMPLATE`, `THEMES`,
`THEME_INFO`, `DEFAULT_THEME`, `isThemeId`, `sha256`, `VERSION`,
`ORZ_MARKDOWN_VERSION`, `FORMATS`, `BUNDLE_FILE`, `cdnBundleUrl`,
`engineSource`, `engineFiles` (types included). The Node library writes the
same bytes as the browser engine's `OrzCarrier.assemble` for the same text and
options; an inline assembly carries this release's engine (checked against its
`release.json`), so callers pass no engine. Includes (`{{md part.md}}`,
`{{md https://…}}`) are shown by a file only from its `#orz-includes` record:
pass them resolved as `assemble(text, { includes })`.

## In web apps

The editor every `.paged.html` carries is also a component for web apps:
[`orz-paged-browser`](https://github.com/wangyu16/orz-paged/blob/main/browser/README.md) (`npm i orz-paged-browser@1`; ES
module or a plain `<script>` that sets `globalThis.OrzCarrier`). An app
mounts any number of editors — each with a Paged.js preview in a sandboxed
frame — keeps the text wherever it likes through its own hooks (save, AI with
a review step, includes, assets, links, ids), works under a nonce
Content-Security-Policy, and assembles `.paged.html` files only when it needs
one. See [docs/embedding.md](docs/embedding.md) (shipped in both packages) and
the working example in [`examples/webapp/`](https://github.com/wangyu16/orz-paged/tree/main/examples/webapp).

A platform that shows assembled files in an iframe speaks the host protocols
(`orz-host-save@1`, `orz-host-ai@1`, `orz-host-include@1`; canonical spec:
orz-markdown `spec/host-protocols.md`, see [PROTOCOL.md](PROTOCOL.md)).

## With an AI agent

- **Every file explains itself.** The agent banner (an HTML comment before
  the `#orz-src` island) says where the text is, how to unescape it, and links
  the agent skill.
- **The skill.** [`orz-paged-skills/SKILL.md`](orz-paged-skills/SKILL.md)
  (shipped in the package; also at
  `https://cdn.jsdelivr.net/npm/orz-paged@1/orz-paged-skills/SKILL.md`) tells
  an agent how to create, edit, extract, inspect and upgrade documents, the
  header keys, the elements, the templates, versions and the two-column
  limits. For Claude Code, copy `orz-paged-skills/` into
  `~/.claude/skills/orz-paged/`.
- **The loop.** Edit the text twin, never the HTML; `orz-paged assemble`
  again. When unsure what a file is, `orz-paged inspect --json <file>` and
  follow its `advice`; an old file gets `orz-paged upgrade`.

## Browser support

| | Chromium (Chrome, Edge, …) | Firefox, Safari |
|---|---|---|
| Read the pages, themes, page zoom, copy as Markdown | yes | yes |
| Print (and Save as PDF from the print dialog) | yes | yes |
| Edit (editor, live page preview, settings) | yes | yes |
| Save in place (File System Access API) | yes — the first Save asks for the file (a picker), later saves write it directly | — Save downloads the file instead |
| Download a copy | download | download |
| New document, from template, Save as new copy | file picker | download |
| Quiet update | saved in place | downloaded |

Only writing to a file on disk needs Chromium's File System Access API;
everything else works in every modern browser. Paged.js lays the pages out
the same way everywhere; a printed PDF is the browser's own (Chromium gives
the most faithful result). A page served over http(s) is never saved in
place: Save says to use *Download a copy*.

## Migrating from 0.x

The 0.x files (orz-paged up to 0.7.3) were experimental and predate text
format 1; 1.0 does not open them as they are. Upgrade each once:

```bash
npx orz-paged@1 inspect old.paged.html        # what it is and what to do
npx orz-paged@1 upgrade old.paged.html        # → old.paged.html (format 1, the 0.x file kept as old.paged.html~) and old.paged.md (its text twin)
npx orz-paged@1 upgrade old.paged.html --text old.browser.paged.md   # when old.paged.md exists: then merge
```

`upgrade` keeps the source: its settings block (`{{nyml kind: document}}`,
wherever 0.x found it) and a `{{nyml kind: meta}}` block become ONE header at
the top (with `carrier: paged` and a `uid`), the 0.x file's `#orz-meta`
metadata and title move into it, the settings mean what they meant, and the
file's delivery is kept. The 0.x API (`buildPagedHtml`, `composeInlineHtml`,
…), the 0.x in-file runtime and the 0.x CLI forms are gone: `--template`,
`--new` and `--list-templates` (and `--title` / `--theme` when assembling)
are refused with the 1.0 command that does the same. A new document is made
with `new`, which takes the title and theme:

```bash
npx orz-paged@1 new report.paged.md --template report-page --title "Q3 Review" --theme light-neat-1
npx orz-paged@1 templates                    # the template ids
```

After that, content (title, theme, page settings) lives in the text's header:
edit it there and assemble again.

## Versions

> **Release status.** 1.1.0 is current; it depends on `orz-markdown ^2.5.0`
> (twin-link naming for hosts, theme-coloured charts and diagrams).
> 1.0.0 is the first release of the rebuild (text format 1). The 0.x line
> (up to 0.7.3) is described in [Migrating from 0.x](#migrating-from-0x).

Two packages, released together with the same version: `orz-paged` (the CLI
and the Node library) and `orz-paged-browser` (the browser engine and editor
component). **Each file carries its own shell**: the version that assembled
it is recorded in the file (`#orz-shell`, `<meta name="generator">`) and keeps
working whatever is installed later; the text format (format 1) is the only
contract between files, tools and apps. `inspect` says when a file's shell is
older or newer than the tool, and the quiet update (or `upgrade`) moves a file
to a newer shell without touching its text. Paged.js is pinned at 0.4.3 (the
two-column handler is tested against it).

## Security — treat these files as programs

A `.paged.html` is executable HTML: opening one runs the engine inside it and,
because Markdown may contain raw HTML, anything in the content. Open and edit
files only from sources you trust; a file cannot prove its own integrity. The
quiet update only fetches from the hard-coded jsDelivr package of this engine,
checks the bundle's SHA-384 from the release manifest, and runs nothing until
the reader clicks *Update now*.

## Development

See [CLAUDE.md](https://github.com/wangyu16/orz-paged/blob/main/CLAUDE.md) for the architecture, commands and conventions,
[CHANGELOG.md](https://github.com/wangyu16/orz-paged/blob/main/CHANGELOG.md) for releases, [notes/CLAIMS.md](https://github.com/wangyu16/orz-paged/blob/main/notes/CLAIMS.md)
for what the tests prove.

## License

MIT
