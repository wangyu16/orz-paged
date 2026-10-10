---
name: orz-paged
description: Create, edit, inspect and upgrade orz-paged documents — a Markdown text twin (x.paged.md, orz text format 1, with a {{nyml kind document}} header) and its single-file, self-editing x.paged.html that lays the text out as print-ready pages (Paged.js), edits and saves itself in the browser and prints to PDF. Use when a user wants a printable document from Markdown (article, report, exam with an answer key, letter, cover letter, CV, note), when you meet a .paged.html file and need its text, when one must be changed, checked or moved to a newer version, or when a web app should embed the paged editor. Covers the header keys (page size, margins, fonts, running headers and footers, page numbers, front matter, versions), templates, document elements (title blocks, abstract, contents, letter and CV parts, exam questions), page breaks and the two-column limits. Edit the text, never the HTML; assemble with the orz-paged CLI.
---

# orz-paged — Markdown that edits itself, as print pages

A document has two forms:

- the **text twin** `x.paged.md` — the document itself: Markdown (orz-markdown
  syntax) with a header block at the top and document elements in the body;
- the **self-editing file** `x.paged.html` = `assemble(text)` — one HTML page
  holding the exact text in a `#orz-src` island plus a regenerable shell: the
  pages (Paged.js, in the page), the pencil with Print, the editor, saves, the
  quiet update.

**Rule: change the text, then assemble. Never edit, restructure or "fix" the
HTML** — everything but the island is regenerated, and a save in the browser
rewrites the whole file from the text. Never serialize the laid-out pages.

The CLI is `orz-paged` (Node ≥ 20.16; `npx orz-paged@1 …` needs no install;
this skill is for 1.x). Use `--json` on any command for one machine-readable
object on stdout. Exit codes: 0 done, 1 refused or failed, 2 usage error.
Nothing that could hold other work is overwritten unless you pass `--force` —
when a command refuses, read the error (with `--json`: `reason` and `next`,
below), do not reach for `--force` by reflex.

**The one robust idiom:** pass the `sha256` the last command printed as
`--replaces`. `assemble`, `extract`, `upgrade` and `inspect` print the SHA-256
of the text they wrote or read (`--json`: `sha256`; `inspect`: `twin.sha256`
for the sibling); `assemble x.paged.md --replaces <that sha256>` replaces the
file only while it still holds that text. It works with no cache, no git, in a
shallow clone, in a fresh sandbox.

## Create a document

```bash
npx orz-paged@1 templates                                   # the templates, by group
npx orz-paged@1 new exam.paged.md --template exam-page --title "Chemistry 101 — Exam 1" [--theme light-academic-2]
# edit exam.paged.md (the header keys and elements below)
npx orz-paged@1 assemble exam.paged.md          # → exam.paged.html (inline engine, ~1.7 MB, works as a file)
npx orz-paged@1 assemble exam.paged.md --cdn    # → a small file that loads the engine from jsDelivr (for web pages)
```

`new` writes the template's starter text with a fresh `uid` (`--title` also
replaces the template's placeholder title in its title block or first heading
and in a running header that repeats it; `--json` reports `themeEffective`, the
theme the pages use); keep the `uid`
(it keys the reader's preferences and the save handle). `new --html` writes
both files at once; without a file name the text goes to stdout. A paged text
twin's name ends in `.paged.md`; a plain `x.md` also assembles (to
`x.paged.html`). `orz-paged x.paged.md` is short for `assemble`. Theme ids:
`orz-paged themes`.

0.x forms are gone: `orz-paged --new <t>` is `orz-paged new x.paged.md
--template <t>`; `orz-paged --template <t>` is `orz-paged new <t>.paged.md
--template <t> --html`; `--list-templates` is `orz-paged templates`. The CLI
refuses them with that command as `next`.

## Edit an existing document

The `.paged.html` can be edited and saved in a browser (and its settings
changed from the pencil's list), so it may hold work the text twin lacks —
even when `x.paged.md` is the newer file. Always compare first.

1. **Compare before you edit.** `npx orz-paged@1 inspect x.paged.md --json`
   (works with only `x.paged.html` too) and read `sha256` and `twin`:
   - no `x.paged.md` yet → `npx orz-paged@1 extract x.paged.html` (exact, byte
     for byte);
   - `twin.holds: "same"` → go on;
   - `twin.holds: "different"` with `twin.earlier` set → the file holds an
     earlier text of `x.paged.md`; go on (assemble replaces it);
   - `twin.holds: "different"` otherwise → `x.paged.html` holds other
     (browser) edits: `npx orz-paged@1 extract x.paged.html -o
     x.browser.paged.md`, merge its changes into `x.paged.md` (or ask the
     user which to keep), and **note `twin.sha256`**;
   - if `x.paged.md` itself has nothing of its own to keep, `npx orz-paged@1
     extract x.paged.html` replaces it when it is a known state (unchanged
     since the CLI last synced the pair, or committed in git), or `extract
     x.paged.html --replaces <sha256 of x.paged.md>`. A plain `extract` never
     overwrites a text that may hold edits.
2. Edit `x.paged.md`. Document settings go in the header, not in the HTML and
   not as CLI options (`assemble` refuses `--title`, `--theme`, `--template`…).
3. `npx orz-paged@1 assemble x.paged.md` → `x.paged.html`. No `--force` is
   needed when the file holds an earlier state of `x.paged.md` the CLI can
   prove: what `orz-paged` itself last wrote into it or read out of it (after
   `extract`, `new --html` or a previous `assemble`, for the same pair — with
   `-o` too: `assemble x.paged.md -o public/x.paged.html --cdn` again and
   again needs nothing), or (for `x.paged.html` itself) a committed version of
   `x.paged.md` in git (HEAD, staged, or one of its 20 most recent commits — a
   full clone works; a shallow checkout, CI's default `--depth 1`, knows only
   the last commit: use `--replaces <sha256>` there). A text equal to one of
   the twin's last 20 commits counts as a known earlier state, so a deliberate
   revert of the other file to such a text is replaced — commit the revert
   first. **In a fresh sandbox, use the token:** `npx orz-paged@1 assemble
   x.paged.md --replaces <twin.sha256>`. If assemble refuses (`twin-differs`),
   someone saved in the browser: do step 1, then run the assemble command the
   refusal names. If only the file changed (and both texts carry the same
   uid), `next` is a plain `extract x.paged.html`: run it. A warning "pair not
   recorded (cache not writable)" means the next assemble needs `--replaces`
   with the hash just printed. Only when `x.paged.md` has everything, `npx
   orz-paged@1 assemble x.paged.md --force` (the replaced file is kept as
   `x.paged.html~`, or `~1`, `~2`… — a backup is never overwritten).

Delivery: `assemble` keeps the existing file's delivery unless you pass
`--cdn` or `--inline`; a new file is inline. Includes: `assemble` keeps the
includes the old file recorded; `--resolve-includes` reads `{{md part.md}}`
files from the text's folder (never outside it); each include left unresolved
is a warning (`--json` `unresolved`), and the file shows an "Included file not
available" note there.

## The document header (FC-18, kind `paged`)

```markdown
{{nyml
kind: document
carrier: paged
uid: doc-7kq2m9x4p1r8s3t5
title: Q3 Reliability Review
author: Platform Team
template: report-page
theme: light-academic-1
page_size: Letter
header_right: Q3 Review
page_number_position: footer-center
page_number_style: page-n-of-N
front_matter: clean
}}
```

- `{{nyml` alone on the first line, `kind: document` on the next, `}}` alone
  on the last — **at the very top of the text** (a `kind: document` block
  further down is not read in format 1: lint `stray-document-block`; move its
  lines into the header). It renders nothing.
- Common keys: `carrier` (`paged`), `uid` (`doc-` + 10–32 of `[0-9a-z]`; do
  not invent or change one — `new` mints it), `title`, `author`,
  `description`, `date`, `keywords`, `source`, `license` / `license_name` /
  `license_url`, `lang`, `theme`, `format` (only `1`; omit it). Your own
  tool's keys: prefix `x_<tool>_`; unknown keys are kept.
- Paged keys (all optional; the template supplies defaults):

| Key | Values | Notes |
|---|---|---|
| `template` | a template id (below) | layout defaults only |
| `theme` | `light-neat-3`, `light-neat-1`, `light-neat-2`, `light-academic-1` (default), `light-academic-2`, `beige-decent-1`, `beige-decent-2`, `light-playful-1`, `light-playful-2`, `none` | light only, by design |
| `page_size` | `A3` `A4` `A5` `Letter` `Legal`, or `210mm 297mm` | |
| `margin_top` / `margin_bottom` / `margin_left` / `margin_right` | mm | default 20 |
| `page_background`, `decoration_color` | CSS colours | restyle the theme's paper / accent |
| `font_preset`, `font_heading_preset`, `font_margin_box_preset`, `font_family` | a preset id (`system-serif`, `source-serif-4`, `lora`, `crimson-pro`, `noto-serif`, `inter`, `ibm-plex-sans`, `roboto`, `raleway`, `noto-sans`, `courier-prime`) or a family | the theme's own fonts otherwise |
| `font_size` (pt), `line_height` | numbers | default 12 / 1.5 |
| `header_left` / `header_center` / `header_right`, `footer_left` / `footer_center` / `footer_right` | text | running header/footer in the page margins |
| `header_rule`, `footer_rule`, `*_rule_color`, `*_font_size` | | |
| `first_page_hide_header`, `first_page_hide_footer` | `true` / `false` | |
| `page_number_position` | `header-left\|center\|right`, `footer-left\|center\|right`, `none` | |
| `page_number_style` | `simple`, `page-n`, `page-n-of-N`, `n-of-N`, `n-slash-N`, `dash-n-dash`, `brackets`, `parentheses` | |
| `page_number_start_page`, `first_page_skip_number` | | |
| `front_matter` | `clean` / `normal` (or a boolean word) | `clean`: title/abstract/contents pages with `placement: page` get no furniture; the body is numbered from 1 |
| `dynamic_choices` | a `key: value` map (`\|` block) | versions, below |
| `limit_image_to_page`, `keep_image_together`, `repeat_table_header`, `avoid_table_row_breaks` | `true` / `false` | all on by default; `repeat_table_header`: a table that runs onto the next page repeats its header row there |
| `custom_css` | CSS (`\|` block) | must not contain `}}` |

- One `key: value` per line; `key: |` then more-indented lines for a
  multi-line value. A value must not contain `}}`. Edit the header in place —
  change one line, never rewrite or reorder the block.
- No `title`? The file's title is the first level-1 heading, else the title
  of the first title element.

## Templates

`orz-paged templates` lists them: `article-page`, `article-section`,
`report-page`, `report-section`, `exam-page`, `exam-section`, `letter`,
`cover-letter`, `cv`, `cv-modern`, `cv-elegant`, `note` (default). A template
is a starter text plus layout defaults; `-page` gives the title its own page,
`-section` an inline title block (0.x `article`/`report`/`exam` →
`-section`). Start from one with `new --template`; the header's `template:`
key changes layout defaults only (it never rewrites the text). In the file:
*New document from template…* saves a fresh document; the current one is
never replaced.

## Elements (`{{nyml kind: <element-kind> …}}` in the body)

An element is a `{{nyml}}` block whose `kind:` **is** the element type. Place it
in the body where you want it to appear. Curated elements:

| `kind:` | What | Key fields |
|---|---|---|
| `article-title` | article title block | `title`, `subtitle`, `authors` (or `author`), `affiliations`, `notes`, `date`, `placement` |
| `report-title` | report title block | `title`, `subtitle`, `authors` (or `author`), `affiliations`, `notes`, `date`, `placement` |
| `exam-title` | exam title / cover | `title`, `subtitle`, `author`, `course`, `duration`, `total_points`, `student_fields`, `instructions`, `date`, `placement` |
| `abstract` | abstract block | `text`, `keywords` |
| `toc` | table of contents | `title`, `max_level`, `placement` |
| `letterhead` | letter letterhead bar | `organization`, `address`, `email`, `phone` |
| `letter-inside-address` | recipient address block | `to`, `organization`, `address` |
| `letter-signature` | closing + signature | `from`, `closing`, `title` |
| `cv-header` | CV name/contact header | `full_name`, `title`, `contacts` |
| `question-mc` | multiple-choice question | `n`, `pts`, `body`, `options`, `answer` (one letter, or several for select-all: `B, D`) |
| `question-open` | open-ended question | `n`, `pts`, `body`, `space`, `answer` |
| `timestamp` | "last updated" line | `label`, `date` |

### Title elements & `placement`

`article-title`, `report-title`, and `exam-title` each take a **`placement`**:

- `placement: section` *(default)* — an **inline title section**: the title block
  sits at the top of the page and the body content flows on the **same page**
  below it.
- `placement: page` — a **dedicated title / cover page** (a page break follows;
  body page numbering starts at 1 on the next page).

```
{{nyml
kind: report-title
title: Q3 Reliability Review
subtitle: Incident trends and remediation
author: Platform Team
date: October 2026
placement: page
}}
```

### Authors, affiliations & notes (`article-title` / `report-title`)

For papers with several authors, use **`authors`** (one author per line) plus
**`affiliations`** and **`notes`** (each a `key: text` list). `key` is the marker
you reference from an author. Each author line is `Name | marks | email | orcid`,
pipe-separated — the fields after the name are **auto-detected** (an `@` is the
email, an ORCID id / `orcid.org` link is the ORCID, anything else is the
affiliation/note markers), so order is flexible and any may be omitted. Email
renders as a mail link and ORCID as the ORCID iD icon.

```
{{nyml
kind: article-title
title: A Practical Comparison of RAFT and ATRP
subtitle: Controlled radical polymerization in the teaching lab
authors: |
  Jane Doe | 1,* | jane.doe@example.edu | 0000-0002-1825-0097
  John Smith | 2 | jsmith@example.org
  Maria Garcia | 1,2
affiliations: |
  1: Department of Chemistry, University of Example
  2: Institute of Science, Example Lab
notes: |
  *: Corresponding author
date: March 2026
}}
```

The simple **`author`** single-line field still works for one author (or a plain
comma-separated list) when you don't need affiliations.

### Clean front matter (`front_matter: clean`)

When the title, abstract, and/or toc are each on their own page (`placement:
page`), set `front_matter: clean` in the header to give those front-matter
pages **no running header, footer, or page number**, and **renumber the body**
so it runs 1…N over the main content only — front-matter pages are excluded from
both the current page number and the `… of N` total. The `article-page` and
`report-page` templates set it by default.

```
{{nyml
kind: document
template: report-page
front_matter: clean
}}
```

### `toc` & `placement`

`toc` builds a table of contents (with live page numbers) from your headings.
`max_level` is the deepest heading included (1–6, default 3). `placement: page`
puts it on its own page. **With `placement: page`, also set `front_matter: clean`
in the header** (`article-page` and `report-page` do): then the contents page
(and a title or abstract page) is left out of the numbering, the body is
numbered 1…N, and the TOC's page numbers are those body numbers — the numbers
printed in the footers. Without it every page counts, the cover included, and
the TOC shows those physical numbers.

```
{{nyml
kind: toc
title: Contents
max_level: 2
placement: page
}}
```

### Exam title — student fields & instructions

On `exam-title` (cover page or inline section — the **first page**), put the
student identity fields and the instructions, so they appear **once** rather than
in a running header on every page:

- **`student_fields`** — labelled fill-in blanks. Each **line is a row**; put
  several fields on the **same line** by separating them with `|`. A trailing
  `/ <number>` (e.g. `Score / 100`) becomes a suffix after the blank.

  ```
  student_fields: |
    Name | Student ID | Score / 100
  ```

  (Or one per line to stack them: `Name`, then `Student ID`, then `Score / 100`.)

- **`instructions`** — a multiline block (Markdown, so lists work) shown under the
  title. Optional: leave it empty and instead write the instructions as normal
  Markdown at the **top of the main content** — either placement works, whichever
  the instructor prefers.

```
{{nyml
kind: exam-title
title: Course Name — Exam 1
author: Instructor Name
duration: 60 minutes
total_points: 100 points
student_fields: |
  Name | Student ID | Score / 100
instructions: |
  **Instructions.** Read each question carefully.
  - Answer all questions; show your work for full credit.
  - No calculators or notes.
placement: page
}}
```

### Exam questions

```
{{nyml
kind: question-mc
n: 1
pts: 5 pts
body: What is the SI unit of force?
options: |
  A. Joule
  B. Newton
  C. Pascal
  D. Watt
answer: B
}}
```

For **select-all-that-apply**, list several correct letters in `answer` — `B, D`
(or `B D`, or `BD`); every matching option is ✓-marked in the answer key:

```
{{nyml
kind: question-mc
n: 2
pts: 6 pts
body: Which of these are vector quantities? (Select all that apply.)
options: |
  A. Mass
  B. Velocity
  C. Temperature
  D. Force
answer: B, D
}}

{{nyml
kind: question-open
n: 2
pts: 10 pts
body: Derive the work-energy theorem from Newton's second law.
space: 4cm
answer: Starting from F = ma and integrating over distance...
}}
```

The `answer:` (and the ✓ on the correct `question-mc` option) is shown only when
the **`answer-key`** dynamic switch is `show` — so one source makes both the
student copy and the instructor key (see "Versions" below).

## Versions — one source, several printouts

`dynamic_choices` in the header (a `key: value` map) decides what the pages
show: content tagged `data-show-when="key=value"` is kept only when the choice
matches, `data-hide-when="key=value"` is removed when it matches. The exam
elements tag their answers `data-show-when="answer-key=show"`:

```
dynamic_choices: |
  answer-key: hide
```

Set `answer-key: show` (and assemble, or choose *Version* in the file's
pencil list or editor bar — a header edit) for the instructor key. Define
your own keys (`audience: student`) and tag HTML in the body
(`<div data-show-when="audience=teacher">…</div>`).

## Page breaks, columns and print

- `::: page-break` then `:::` on the next line starts a new page.
- A long table breaks between rows and repeats its header row (`thead`) at
  the top of each page it continues on (`repeat_table_header: false` turns
  that off). Running headers, footers and page numbers take the theme's body
  font and its muted text colour.
- `:::: cols` / `::: col` … `:::` / `::::` lays text side by side. Across a
  page break a short block moves whole to the next page; a long one splits
  column by column (column 1 continues in column 1). **Limits:** a lone long
  column stays narrow; only paragraphs, list items, blockquotes and plain
  blocks split (images, figures, code, tables, math, headings, boxed asides
  move whole); one-line widows happen; a block taller than a page is clipped.
  Nested and numbered lists split too (a continued list keeps its numbers and
  repeats no bullet).
  Keep each column's blocks short, or avoid columns for long material.
- Print = the file's *Print* (pencil list, right after Edit), or the
  browser's print, from the read view: the pages print as laid out (*Save as
  PDF* in the dialog); Cmd/Ctrl+P while editing leaves the editor first. The
  CLI makes no PDF. On a slow network the pages show after about 2 s with
  fallback fonts and are laid out again when the fonts arrive; Print waits for
  that.
- Print-first content: math, code, tables, Mermaid, `{{smiles}}`, `{{chart}}`,
  `{{qr}}`, images, callouts (`::: info` / `success` / `warning` / `danger`),
  footnotes all print. Tabs, `::: spoil` and video are discouraged (they hide
  content or do not print) — not forbidden. Light paper only.

Content syntax is orz-markdown's: read its skill,
`node_modules/orz-markdown/orz-markdown-skills/SKILL.md` or
`https://cdn.jsdelivr.net/npm/orz-markdown/orz-markdown-skills/SKILL.md`.

## Inspect before you act

```bash
npx orz-paged@1 inspect x.paged.html --json    # also works on a text, a 0.x file, any HTML
```

Read `input` (`text`, `assembled`, `legacy`, `html`), `kind`, `format`,
`writable`, `shell.version` / `shell.relation`, `uid`, `title`, `theme`,
`template`, `settings`, `header.keys`, `includes`, `lint`, `checks` (a file's
structure), `sha256` (the `--replaces` token), `twin` (the sibling
`x.paged.md` ↔ `x.paged.html`: `holds`, `newer`, `sha256`, `earlier`), and
**follow `advice`** — it names the command to run, with your file names:

- `legacy` (an orz-paged 0.x file) → `upgrade`; next to an existing
  `x.paged.md`: `upgrade x.paged.html --text x.browser.paged.md`, then merge
  (keep the new header) — `extract` does not read 0.x files;
- `twin.holds: "different"` → extract and merge before assembling (unless
  `twin.earlier` is set: then assemble replaces it);
- `checks.island: "unclosed"` → the file was cut off: `extract x.paged.html -o
  x.recovered.paged.md`, compare with a backup; `checks.engine: "different"` /
  `"missing"` → `upgrade` re-assembles it (the text is intact);
- an older shell → `upgrade`; a newer shell or text `format` → `npx
  orz-paged@latest` (do not force a downgrade);
- lint errors, a `stray-document-block` → fix the header, then assemble;
  `invalid-value` (a warning: `page_number_style: roman`, `page_size: B9`…)
  names the values the key takes — the default is used until you fix it;
- another kind (`md`, `slides`) → its own tool (`npx orz-mdhtml`, …).

## When a command refuses (`--json`)

A failure is `{ "ok": false, "error", "reason", "next"?, "exitCode" }`. `next`
is `{ "command", "args" }`: run `npx orz-paged@1 <command> <args…>` verbatim
(it never replaces a text with another line of work). Stable `reason` codes:
`twin-differs` (extract to `x.browser.paged.md`, merge, assemble with
`--replaces`), `replaces-mismatch` (a save happened since: extract again and
merge), `legacy-file` (`upgrade`, then `assemble --replaces` with the
`sha256` upgrade printed — not `--force`), `output-differs` (another text at
`-o`: follow `next`; another document: choose another path), `newer-shell` /
`newer-format` (`npx orz-paged@latest`), `unclosed-island`, `not-orz`,
`exists`, `assembled-input`, `other-kind`, `invalid-text`, `no-such-file`,
`unreadable`, `not-utf8`, `write-failed`, `engine-unavailable`, `bad-usage`
(exit 2; also a 0.x form, with the 1.0 command as `next`), `failed`.

## Upgrade old files

```bash
npx orz-paged@1 upgrade old.paged.html            # in place, and writes old.paged.md (its text twin)
npx orz-paged@1 upgrade old.paged.html -o new.paged.html --text new.paged.md
```

A 0.x file (orz-paged ≤ 0.7.3) keeps its source: the settings block
(`{{nyml kind: document}}`, wherever 0.x found it) and a `kind: meta` block
become one header at the top, with `carrier: paged`, a `uid`, and the 0.x
`#orz-meta` metadata and title; the settings mean what they meant (a `}}`
inside `custom_css` becomes `} }`, reported). The delivery is kept unless
`--cdn` / `--inline`. A format-1 file of an older shell is re-assembled with
its text and includes unchanged. A newer shell and a cut-off file are refused
(`--force` overrides and keeps `x.paged.html~`). Upgrading twice changes
nothing more.

## Recover the text from any version by hand

Read the `<script type="text/markdown" id="orz-src">` element's raw content
and undo its escaping:

- **Format 1** (`<script id="orz-shell">` exists): remove **one** backslash
  after each `<` that is followed by backslashes and then `script` or
  `/script` (any case); turn the line breaks into the style named by
  `data-orz-eol` (`lf`, `crlf`, `cr`); prefix U+FEFF when `data-orz-bom` is
  present. In code: `extract(html).text` from `orz-markdown/carrier` (or
  `orz-paged`).
- **0.x** (no `#orz-shell`; generator `orz-paged 0.x`): replace each
  `<\/script` with `</script`; remove the one line break the writer added at
  the start and at the end. Metadata is in `<script id="orz-meta">`. Prefer
  `orz-paged upgrade`.

## In a web app

The same editor is a component: `npm i orz-paged-browser@1`, then
`mountEditor(element, { text, hooks: { save, ai, fetchInclude, … }, nonce })`
(ES module, or `globalThis.OrzCarrier` from the IIFE); its preview lays out
Paged.js pages in a sandboxed frame. Store the text; call `assemble(text)`
only when a file is needed. Hooks and the CSP recipe: `docs/embedding.md`,
shipped in both packages. Platforms that show assembled files in an iframe use
the host protocols (orz-markdown `spec/host-protocols.md`).

## What the file does for its reader

The pages in the page, and ONE control: a pencil at the bottom-left (click:
Edit; hover or tap: Edit, Print, Save, Download a copy, New document, Save as
new copy, Theme, Page size, Template, Page numbers, Number style, Version, New
document from template…, Page zoom). Settings write the header (undoable,
unsaved until Save); *Page zoom* is the reader's and never saved. **Edit**
(Cmd/Ctrl+E): editor + live page preview. **Save** (Cmd/Ctrl+S) writes
`assemble(text)` in place in Chromium, downloads elsewhere; a save over a file
changed on disk asks first. A quiet, once-a-day update offer on local files.

## Gotchas

- Do not edit `x.paged.html` by hand; the text is the document.
- Keep the `uid` across revisions; a different document needs its own (`new`,
  or the file's *Save as new copy* / *New document from template…*).
- `--force` keeps what it replaces as `<file>~` (or `~1`, `~2`…); still,
  compare before you force. The pair records live in
  `$XDG_CACHE_HOME/orz-paged/` (else `~/.cache/orz-paged/`).
- Package: `orz-paged` 1.x depends on `orz-markdown ^2.3.0` and pins Paged.js
  0.4.3; files record the shell version that wrote them.
- Security: a `.paged.html` runs the code inside it — treat files like
  programs and open only trusted ones.
