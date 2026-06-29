---
name: orz-paged
description: Author and edit self-contained .paged.html print documents (orz-paged). Use when a user wants to turn Markdown into a paginated, printable document — one portable HTML file that, in any browser, shows the text as real print pages on light paper (paged.js), is edited in-browser, and exports to PDF by printing (Ctrl/Cmd+P → Save as PDF). Covers the document settings block, templates, the curated document elements (title sections, abstract, toc, letter and CV parts, exam questions), page breaks, and print-first content guidance.
---

# orz-paged — author a `.paged.html` document

`orz-paged` turns a **Markdown source** into **one `.paged.html` file** that:

- shows the document as a sequence of **print pages on light-colored paper**
  (real page size, margins, running headers/footers, page numbers) in any modern
  browser, via [paged.js](https://pagedjs.org),
- is authored entirely in **orz-markdown** (math, mermaid, smiles, qr, charts,
  tables, admonitions, columns) plus a small **document layer**,
- can be **edited in the browser** (CodeMirror source + live paged preview) and
  **saves itself** back into the file,
- **exports to PDF by printing** — the on-screen pages are the printed pages
  (Ctrl/Cmd+P → Save as PDF, or the ↓ button), so there is no rendering surprise.

The Markdown source is the single source of truth, embedded in the file:

```html
<script type="text/markdown" id="orz-src">
  ...your Markdown (this is what you write)...
</script>
```

You write only the **Markdown source**. Never hand-write the surrounding HTML
(the paged.js shell, runtime, CDN links) — saving regenerates it. To change a
document, edit the source (in a `.md` file fed to the CLI, or in-browser) and let
the tool re-render.

## When to use it

- A user wants a **single shareable file** that looks like a printed document —
  an article, report, letter, CV, note, or exam — and can be turned into a PDF by
  printing, with no install.
- The content is **markdown-native** (prose, tables, math, diagrams) and the
  author wants a paginated document, not a slide deck or a continuous web page.
- Prefer `.paged.html` (orz-paged) when the output is a **paginated document to
  print or hand in**; prefer `.md.html` (orz-mdhtml) for a continuous document to
  read/annotate on screen; prefer `.slides.html` (orz-slides) for a deck to
  present.

> It mimics **ink on paper**: light backgrounds only, no dark mode, no
> interactive constructs. Author for print (see [Print-first content](#print-first-content)).

---

## Workflow

Generate from a Markdown file:

```bash
orz-paged document.md                  # → document.paged.html
orz-paged document.md -o out.paged.html # choose the output name
orz-paged document.md --inline         # (default) embed engine + all themes
orz-paged document.md --cdn            # reference engine + theme from jsDelivr

orz-paged --template article-page      # scaffold + render a starter document
orz-paged --new letter -o draft.md     # write a starter .md you then edit
orz-paged --list-templates             # list the templates
```

You can also start from a template **inside the editor**: open it (✎) and click
the **template** button (📄) in the toolbar — a grouped picker of starter
documents; choosing one drops the starter into the editor (any existing content is
preserved in an HTML comment).

`--inline` (default) embeds the `orz-paged` engine + paged.js + the active theme,
so the document **paginates offline**. Either way, **fonts, web images, and the
math/diagram/chart libraries load from a CDN at view time** (so a document that
uses those, or in-browser editing, needs internet).

Then **open the `.paged.html` in any modern browser** — it paginates into pages.

- Click the **✎** button to open the editor (source + live paged preview).
- **Ctrl/Cmd+S** saves the file in place (needs a Chromium-based browser, File
  System Access API; falls back to download elsewhere).
- **Export PDF** = the **↓** button, or the browser's **Print → Save as PDF**.
  The pages you see are exactly what prints.

---

## The Markdown source: settings, then content

A source is a **document-settings block** at the top, then normal Markdown body
(with elements and page breaks placed wherever you need them):

```
{{nyml
kind: document
template: article
theme: light-academic-1
}}

{{nyml
kind: article-title
title: A Practical Comparison of RAFT and ATRP
subtitle: Controlled radical polymerization in the teaching lab
author: Dr. Yu Wang
date: March 2026
}}

{{nyml
kind: abstract
text: We compare two controlled-radical methods on accessible monomers...
keywords: RAFT, ATRP, controlled polymerization
}}

## Introduction

Body text in normal Markdown. Math like $E = mc^2$, tables, lists, and
diagrams all print.
```

---

## 1 · Document settings (`{{nyml kind: document}}`)

One block at the top configures the whole document. **Template-first:** most
documents set only `template:` (and maybe `theme:` and `decoration_color:`) — the
template sets every other default. The rest are **optional overrides** for power
users and agents.

```
{{nyml
kind: document
template: article
}}
```

### Templates (set one — it picks the layout + a starter skeleton)

**A template owns *layout only*** — page size, furniture (running headers/footers,
page numbers), and which elements appear and where. **The look — font, decoration
color, and element styling — comes from the `theme`**, so the same theme renders
the same across every template. `article`, `report`, and `exam` come in **two
variants** — `-page` (a dedicated title/cover page) and `-section` (an inline title
block above the content):

| `template` | For | Layout |
|---|---|---|
| `article-page` / `article-section` | academic paper | title (own page / inline) + `abstract` (own page in `-page`) + body |
| `report-page` / `report-section` | business / technical report | title (own page / inline) + `toc` + running header/footer + body |
| `exam-page` / `exam-section` | exam / assessment | title (cover / inline) + `question-*`, answer-key toggle |
| `letter` | formal letter | `letterhead` + inside-address + body + signature |
| `cover-letter` | job cover letter | sender header + recipient + body + sign-off |
| `cv` | résumé (classic) | `cv-header` + sectioned body |
| `cv-modern` | résumé (modern) | accent name + rule, uppercase labels, right-aligned dates, skill chips |
| `cv-elegant` | résumé (elegant) | centered, hairline rules, two-column "ledger" entries |
| `note` | clean readable notes | A4, minimal furniture |

The bare names `article` / `report` / `exam` still work and resolve to the
`-section` variant. To change the look, set `theme:` (not the template).

### Overrides (all optional — the template supplies defaults)

| Key | Values / unit | Notes |
|---|---|---|
| `page_size` | `A3` `A4` `A5` `Letter` `Legal`, or custom `"210mm 297mm"` | |
| `margin_top` / `margin_bottom` / `margin_left` / `margin_right` | number (mm) | |
| `font_preset` | see [Font presets](#font-presets) | body font |
| `font_size` | number (pt) | |
| `line_height` | number (ratio, e.g. `1.5`) | |
| `decoration_color` | CSS color, e.g. `"#2962a4"` | accent used by theme + elements |
| `header_left` / `header_center` / `header_right` | text | running header margin boxes |
| `footer_left` / `footer_center` / `footer_right` | text | running footer margin boxes |
| `page_number_position` | `header-left\|center\|right`, `footer-left\|center\|right`, `none` | where the page number sits |
| `page_number_style` | see [Page-number styles](#page-number-styles) | how it reads |
| `front_matter` | `clean` (or `normal`, the default) | `clean`: strip header/footer/number from every `placement: page` front-matter page (title / abstract / toc) and restart the page count so the body begins at **1** |
| `dynamic_choices` | a `key: value` map | conditional content — print several versions from one source (e.g. `answer-key: hide`); see [Dynamic switch](#dynamic-switch--print-several-versions-from-one-source) |
| `theme` | `none` · `light-neat-1/2/3` · `light-academic-1/2` · `beige-decent-1/2` | **light only** |

#### Font presets

Serif: `system-serif` `source-serif-4` `lora` `crimson-pro` `noto-serif` ·
Sans: `inter` `ibm-plex-sans` `roboto` `raleway` `noto-sans` ·
Mono: `courier-prime`.

#### Page-number styles

`simple` (just the number) · `page-n` (`Page 3`) · `page-n-of-N` (`Page 3 of 12`) ·
`n-of-N` (`3 of 12`) · `n-slash-N` (`3 / 12`) · `dash-n-dash` (`— 3 —`) ·
`brackets` (`[3]`) · `parentheses` (`(3)`).

#### Themes (light only — by design)

Seven light themes, vendored from the orz family and print-adapted:

- `light-neat-1/2/3` — modern sans (blue / teal / Orchard-green accents),
- `light-academic-1/2` — scholarly serif (justified, ruled tables),
- `beige-decent-1/2` — warm editorial paper,
- `none` — plain.

There are **no dark themes** — the document mimics ink on paper. **The theme owns
the look** — font, accent (decoration) color, and element styling — so it is
consistent across every template. The **default theme is `light-academic-1`** (used
when a document doesn't set `theme:`). An explicit `font_preset` /
`decoration_color` / `page_background` still overrides the theme (so
`layout (template) + look (theme) ← your explicit settings`).

---

## 2 · Elements (`{{nyml kind: <element-kind> ...}}`)

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
page`), set `front_matter: clean` in the document block to give those front-matter
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
puts it on its own page.

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
student copy and the instructor key (see [Dynamic switch](#dynamic-switch--print-several-versions-from-one-source)).

---

## Dynamic switch — print several versions from one source

`dynamic_choices` is a document setting (a `key: value` map) that drives
**conditional content**. Any element carrying `data-show-when="key=value"` is kept
only when the choice matches; `data-hide-when="key=value"` is removed when it
matches. The exam questions use this automatically: the answers are tagged
`data-show-when="answer-key=show"`.

```
{{nyml
kind: document
template: exam-page
dynamic_choices: |
  answer-key: hide      ← student copy (default); set to `show` for the key
}}
```

- **In the file**: change `answer-key: hide` → `show` and re-render to produce the
  instructor key (✓ marks + model answers revealed).
- **In the editor**: a live **answer key** dropdown appears in the toolbar
  whenever a document uses `dynamic_choices` — flip it to preview/print either
  version without editing the source.

It is general-purpose: define your own keys (e.g. `audience: student`) and tag
content with `data-show-when` / `data-hide-when` (an HTML span/div in the source,
or a future custom element) to print tailored variants from one file.

---

## 3 · Page breaks

Force a new page with the orz-markdown arbitrary-class container `page-break`
(no plugin, no extra syntax):

```
::: page-break
:::
```

Everything after it starts on a fresh page.

---

## 4 · Body content (print-first orz-markdown)

The body is full orz-markdown. Everything below **prints well** and is encouraged:

- **Headings, lists, tables, blockquotes, code blocks.**
- **Math** — inline `$E=mc^2$` and display `$$ ... $$` (KaTeX).
- **Mermaid** diagrams (```` ```mermaid ````), **smiles** chemistry
  (`{{smiles ...}}`), **`{{chart}}`** (bar/line/pie), **`{{qr}}`** (a printed QR
  is genuinely useful), images, and footnotes.
- **`{{toc}}`** inline anchors, **admonitions** (`::: info` / `::: success` /
  `::: warning` / `::: danger`), and **columns** (`:::: cols`).

For the full orz-markdown syntax (containers, `{{name body}}` plugins,
`{{attrs[#id .class]}}`), read the orz-markdown skill at
`node_modules/orz-markdown/orz-markdown-skills/SKILL.md`.

### Print-first content

A `.paged.html` mimics paper, so author for print:

- **Avoid screen-only / dynamic constructs** — **tabs**, **spoilers**
  (`::: spoil`), and **youtube**. They hide content or are video, which is
  meaningless on paper.
- **Light backgrounds only** — there are no dark themes by design.
- These are guidance, not hard blocks — orz-markdown still renders them — but the
  templates and themes won't use them.

---

## Do / don't

**Do**
- Start with one `{{nyml kind: document}}` block; in the common case set only
  `template:` (plus maybe `theme:` / `decoration_color:`).
- Use a title element (`article-title` / `report-title` / `exam-title`) and pick
  `placement: section` (inline) or `placement: page` (cover page).
- Force pages with `::: page-break` / `:::`.
- Keep content static and printable — tables, math, diagrams, charts, QR codes.

**Don't**
- Don't hand-edit the generated `.paged.html`; edit the Markdown source.
- Don't use tabs, `::: spoil`, or youtube — they don't print.
- Don't ask for a dark theme; the document is always light (ink on paper).
- Don't expect a PDF binary from the CLI — the PDF comes from the browser's
  Print → Save as PDF on the open file.

---

## Examples

### An article with an inline title section and abstract

```
{{nyml
kind: document
template: article
theme: light-academic-1
decoration_color: "#2962a4"
}}

{{nyml
kind: article-title
title: A Practical Comparison of RAFT and ATRP
subtitle: Controlled radical polymerization in the teaching lab
author: Dr. Yu Wang
date: March 2026
}}

{{nyml
kind: abstract
text: We compare two controlled-radical methods on accessible monomers, with
  emphasis on dispersity and reproducibility in an undergraduate setting.
keywords: RAFT, ATRP, controlled polymerization, dispersity
}}

## Introduction

Controlled radical polymerization gives narrow dispersity ($\PDI < 1.2$)...

## Methods

| Method | Mediator | Typical PDI |
|---|---|---|
| RAFT | thiocarbonylthio | 1.05–1.15 |
| ATRP | Cu/ligand | 1.05–1.20 |
```

### A one-line note

```
{{nyml
kind: document
template: note
}}

Pick up dry cleaning, email the draft to the committee, and water the plants.
```

## Security

`.paged.html` files are **self-contained executable HTML** — opening one runs its
embedded JavaScript. Treat them like programs: only open or edit files from a
trusted source, and advise users the same. The one-click framework update is
opt-in (edit view only, explicit confirm) and always fetches from the hardcoded
canonical jsDelivr packages — a tampered file can't redirect it. A file's
integrity can't be verified from inside it; for authenticity, verify out-of-band.
See the README "Security" section.
