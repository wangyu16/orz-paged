> **Provenance & status:** this is the document/authoring model of the
> `orz-md-pdf` VS Code extension (`wangyu16/orz-md-pdf-vscode`,
> `pipeline-model/docs/pipeline-model.md`), kept here as a **specification
> reference**. orz-paged does **not** adopt it wholesale or depend on its code —
> it **reimplements a curated subset in TypeScript** (see [DESIGN.md](../DESIGN.md)
> §3, §8), assumes internet (CDN fonts/images/libs, no embedding), supports
> **light themes only**, and exports PDF via browser print (not Puppeteer). Treat
> tables/elements below as the menu to curate from, not a contract to fulfill.

# pipeline-model

Standalone Phase I pipeline: Markdown → paged.js HTML → Puppeteer PDF.

## Quick Start

```bash
cd pipeline-model
npm install
npm run preview          # live preview at http://localhost:3000
npm run convert -- test/core-smoke.md out/out.pdf
```

PDF conversion requires a local Chromium/Chrome install. If it is not found automatically:

```bash
export CHROMIUM_PATH=/path/to/chrome
```

---

## Document Settings (`kind: document`)

Every document begins with a NYML document block that controls page layout, fonts, colors, and behavior. All fields are optional — omitted fields fall back to defaults.

```
{{nyml
kind: document
page_size: A4
font_preset: noto-serif
decoration_color: "#2962a4"
}}
```

### Page

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `page_size` | string | `A4` | `A3` `A4` `A5` `Letter` `Legal` |
| `margin_top` | number | `20` | mm |
| `margin_bottom` | number | `20` | mm |
| `margin_left` | number | `20` | mm |
| `margin_right` | number | `20` | mm |
| `page_background` | string | _(none)_ | CSS color string, e.g. `"#fdf8f0"` |
| `page_background_effect` | string | `none` | `ruled` `grid` `dots` `graph` |

### Typography

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `font_preset` | string | `system-serif` | See [Font Presets](#font-presets) |
| `font_family` | string | _(from preset)_ | Overrides the CSS `font-family` directly |
| `font_heading_preset` | string | _(same as body)_ | Separate preset for headings; `none` = same as body |
| `font_margin_box_preset` | string | _(same as body)_ | Separate preset for header/footer margin boxes |
| `font_size` | number | `12` | pt |
| `line_height` | number | `1.5` | unitless ratio |
| `decoration_color` | string | `#000000` | Accent color used by themes and elements (CSS color) |

### Page Numbers

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `page_number_position` | string | `footer-center` | `header-left` `header-center` `header-right` `footer-left` `footer-center` `footer-right` `none` |
| `page_number_style` | string | `simple` | `simple` `page-n` `page-n-of-N` `n-of-N` `n-slash-N` `dash-n-dash` `brackets` `parentheses` |
| `page_number_start_page` | number | `1` | Physical page on which numbering begins (1 = first page) |
| `first_page_skip_number` | boolean | `false` | Suppress page number on the first body page (implies `page_number_start_page: 2`) |

### Headers and Footers

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `header_left` | string | _(empty)_ | Static text in the top-left margin box |
| `header_center` | string | _(empty)_ | Static text in the top-center margin box |
| `header_right` | string | _(empty)_ | Static text in the top-right margin box |
| `header_rule` | boolean | `true` | Draw a thin rule below the header |
| `header_rule_color` | string | `#000000` | Rule color; defaults to `decoration_color` |
| `header_font_size` | number | `9` | pt |
| `footer_left` | string | _(empty)_ | Static text in the bottom-left margin box |
| `footer_center` | string | _(empty)_ | Static text in the bottom-center margin box |
| `footer_right` | string | _(empty)_ | Static text in the bottom-right margin box |
| `footer_rule` | boolean | `true` | Draw a thin rule above the footer |
| `footer_rule_color` | string | `#000000` | Rule color; defaults to `decoration_color` |
| `footer_font_size` | number | `9` | pt |
| `first_page_hide_header` | boolean | `false` | Hide header on the first body page |
| `first_page_hide_footer` | boolean | `false` | Hide footer on the first body page |
| `pre_body_hide_header` | boolean | `true` | Hide header on `placement: pre-body` pages |
| `pre_body_hide_footer` | boolean | `true` | Hide footer on `placement: pre-body` pages |

### Layout Behavior

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `limit_image_to_page` | boolean | `true` | Scale images down to fit within the page |
| `keep_image_together` | boolean | `true` | Avoid page breaks inside images |
| `repeat_table_header` | boolean | `true` | Re-print `<thead>` at the top of each page for long tables |
| `avoid_table_row_breaks` | boolean | `true` | Prevent page breaks inside table rows |

### Theme, Template, and Customization

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `theme` | string | _(none)_ | See [Themes](#themes) |
| `template` | string | _(none)_ | See [Templates](#templates) — sets many defaults at once |
| `custom_css` | string | _(empty)_ | Injected verbatim into `<head>`; multiline with `\|` |
| `dynamic_choices` | map | `{}` | Key-value choices for `data-show-when` / `data-hide-when`; see [Dynamic Switch](#dynamic-switch) |

---

## Themes

Themes style headings, paragraphs, blockquotes, tables, code blocks, and lists. They do **not** set fonts or page size — those come from font presets and template settings.

| Theme | Character |
|-------|-----------|
| `light-academic-1` | Tufte-inspired serif academic — justified text, small-caps `h3`, warm white background |
| `light-academic-2` | Structured minimal academic — clean left-aligned, strong borders, navy links |
| `light-neat-1` | Modern clean sans — blue accent (`#2e8bcf`), rounded corners, gradient heading decorations |
| `light-neat-2` | Warm earthy modern — teal/green accent (`#167a72`), diamond list bullets, stacked tab-bar style |
| `light-playful-1` | Warm notebook feel — sticky-note callouts with tape, rotated `h1`, dashed borders |
| `light-playful-2` | Neobrutalist/pop-art — bold box shadows, hand-drawn borders, marker-color highlights |
| `beige-decent-1` | Warm editorial/bookish — justified text, centered `h1` with heavy border, italic blockquote with rules |
| `beige-decent-2` | Warm modern — DM Sans headings, Lora body, pill tabs, rounded corners, teal links |

Use `theme: none` (or omit) for a plain unstyled document, or when a template already handles all styling.

---

## Templates

Templates apply a curated combination of page size, margins, font presets, theme, and optional custom CSS. A template is the starting point — any `kind: document` field overrides the template value.

| Template | Description |
|----------|-------------|
| `default` | Clean formal document. Noto Serif body, `light-academic-1` theme, Letter page |
| `academic` | Classic academic/report layout. System Serif, default theme |
| `casual-note` | Modern readable notes. Lora body, `light-neat-1` theme |
| `handwritten-note` | Warm notebook feel. Neucha font, `light-playful-1` theme, ruled page background |
| `beige-journal` | Editorial/magazine article. Lora body + Raleway headings, `beige-decent-1`, A4, dash-n-dash folio |
| `beige-book` | Literary prose / novel. Crimson Pro body + Lora headings, `beige-decent-1`, wide gutter |
| `cv-linear` | Classic single-column CV. Source Serif 4 body + IBM Plex Sans headings, no theme |
| `cv-block-grid` | Two-column grid CV (`:::: cols` containers). Noto Sans, no theme |
| `cv-sidebar` | Sidebar accent CV (paged.js running element). Inter, no theme; requires `cv-sidebar-layout` element |

---

## Font Presets

Font presets bundle a web font with its correct CSS `font-family` stack. All fonts are served from locally bundled `@fontsource/*` packages — no network calls.

**Tier A — fully supported (400, 700, italic variants):**

| Preset | Category | Family |
|--------|----------|--------|
| `system-serif` | serif | Times New Roman fallback stack |
| `source-serif-4` | serif | Source Serif 4, Georgia |
| `lora` | serif | Lora, Georgia |
| `crimson-pro` | serif | Crimson Pro, Georgia |
| `noto-serif` | serif | Noto Serif, Georgia |
| `noto-serif-sc` | CJK serif | Noto Serif SC + Latin |
| `noto-serif-tc` | CJK serif | Noto Serif TC + Latin |
| `inter` | sans | Inter, Helvetica Neue |
| `ibm-plex-sans` | sans | IBM Plex Sans, Helvetica Neue |
| `roboto` | sans | Roboto, Helvetica Neue |
| `raleway` | sans | Raleway, Helvetica Neue |
| `noto-sans` | sans | Noto Sans, Helvetica Neue |
| `noto-sans-sc` | CJK sans | Noto Sans SC + Latin |
| `noto-sans-tc` | CJK sans | Noto Sans TC + Latin |
| `courier-prime` | mono | Courier Prime, Courier New |
| `comic-neue` | handwriting | Comic Neue, Comic Sans MS |
| `neucha` | handwriting | Neucha, Comic Sans MS |

**Tier B — available, limited variants:**

| Preset | Category | Family |
|--------|----------|--------|
| `lxgw-wenkai-tc` | CJK handwriting | LXGW WenKai TC + Latin |
| `ma-shan-zheng` | CJK handwriting | Ma Shan Zheng + Latin (400 only) |

---

## Built-in Elements

Elements are inserted with a `kind: element` NYML block. Each element's scoped CSS is injected once per document. Elements that accept `placement: pre-body` render on a separate named page with headers/footers suppressed and the body page counter starting at 1.

### Academic / Thesis

#### `thesis-title-page`
Full-page centered title page for thesis or dissertation documents.

| Field | Notes |
|-------|-------|
| `title` ✱ | Inline markdown |
| `subtitle` | Inline markdown |
| `author` | Inline markdown |
| `degree` | e.g. `Doctor of Philosophy` |
| `department` | Plain text |
| `institution` | Plain text |
| `date` | e.g. `March 2026` |
| `placement` | `pre-body` — standalone cover page |

#### `academic-title-section`
Compact centered title block for journal articles and reports.

| Field | Notes |
|-------|-------|
| `title` ✱ | Inline markdown |
| `authors` | Comma-separated; supports `^N` superscripts |
| `affiliations` | Pipe-separated list; supports `^N` superscripts |
| `date` | e.g. `March 2026` |
| `doi` | DOI string |

#### `abstract`
Abstract block with optional keywords.

| Field | Notes |
|-------|-------|
| `text` ✱ | Block markdown |
| `keywords` | Inline markdown |
| `heading_style` | `centered` (default) — "ABSTRACT" heading on its own line; `inline` — bold run-in "Abstract." |
| `placement` | `pre-body` — standalone abstract page |

### Letters

#### `letterhead`
Full letterhead bar with logo area and contact details.

| Field | Notes |
|-------|-------|
| `organization` ✱ | Inline markdown |
| `tagline` | Inline markdown |
| `logo` | Image using `![]()` syntax |
| `logo_text` | Plain text fallback when no logo |
| `address` | Pipe-separated address lines |
| `phone` | Plain text |
| `email` | Plain text |
| `website` | Plain text |
| `border` | `false` to hide bottom rule |

#### `letterhead-academic`
Two-column academic letterhead: institution branding left, sender contact right.

| Field | Notes |
|-------|-------|
| `institution` ✱ | Inline markdown |
| `department` | Inline markdown |
| `logo` | Image using `![]()` syntax |
| `sender_name` | Inline markdown |
| `sender_title` | Pipe-separated title lines |
| `address` | Pipe-separated address lines |
| `phone` | Plain text |
| `email` | Plain text |
| `website` | Plain text |

#### `letterhead-academic-2`
Variant of `letterhead-academic` with a different visual weight and layout.
Fields: same as `letterhead-academic`.

#### `letter-inside-address`
Formal inside address block (placed after the date, before the salutation).

| Field | Notes |
|-------|-------|
| `to` ✱ | Recipient's full name |
| `title` | Pipe-separated title/position lines |
| `organization` | Pipe-separated organization lines |
| `address` | Pipe-separated address lines |
| `align` | `left` (default) \| `right` |

#### `letter-signature`
Formal closing and signature block.

| Field | Notes |
|-------|-------|
| `from` ✱ | Signer's full name; inline markdown |
| `closing` | Closing phrase; default `Sincerely` |
| `signature_image` | Image using `![]()` syntax; replaces blank space |
| `signature_space` | CSS height for handwritten sig area; default `1in` |
| `margin_left` | CSS left offset of the block; default `40%` |
| `title` | Pipe-separated title lines; inline markdown |
| `organization` | Pipe-separated organization lines; inline markdown |

### Utilities

#### `toc`
Table of contents with dot leaders and live page numbers (filled in by the paged.js runtime).

| Field | Notes |
|-------|-------|
| `title` | TOC heading; default `Table of Contents` |
| `max_level` | Deepest heading level to include (1–6); default `3` |
| `placement` | `pre-body` — dedicated TOC page |

#### `timestamp`
Right-aligned "last updated" line.

| Field | Notes |
|-------|-------|
| `label` | Label text; default `Last updated` |
| `date` | Date string, or `auto` / omit for today's date |

### CV / Résumé Headers

All CV header variants share the same field schema:

| Field | Notes |
|-------|-------|
| `full_name` ✱ | Inline markdown |
| `title` | Professional title/tagline; inline markdown |
| `contacts` | Pipe-separated contact items |
| `photo` | Image using `![]()` syntax; rendered as a circle |
| `summary` | Brief summary below the rule; block markdown |
| `border` | `false` to suppress the bottom rule |

| Element | Layout |
|---------|--------|
| `cv-header` | Name left, photo right; contacts as a flex row below the name |
| `cv-header-centered` | All content centered; photo above name when provided |
| `cv-header-split` | Name+title left column, contacts stacked right; photo above contacts |
| `cv-header-compact` | Name · title on one baseline row, contacts on the line below; no photo |
| `cv-header-banner` | Full-width colored band with white name; title + contacts below |

#### `cv-sidebar-layout`
Sidebar block for the `cv-sidebar` template. paged.js extracts it from the flow and repeats it in the left margin box on every page. Place at the very top of the document.

| Field | Notes |
|-------|-------|
| `full_name` | Displayed prominently at the top of the sidebar |
| `photo` | Image using `![]()` syntax; circular |
| `sidebar` ✱ | Block markdown — use `**Bold**` lines as section labels, plain lines as values |

### Exam / Assessment

#### `exam-title-page`
Full-page exam cover sheet.

| Field | Notes |
|-------|-------|
| `title` ✱ | Inline markdown |
| `course` | Inline markdown |
| `instructor` | Plain text |
| `date` | Plain text |
| `duration` | e.g. `90 minutes` |
| `total_points` | e.g. `100 pts` |
| `student_info` | Pipe-separated fill-in labels; default `Name \| Student ID` |
| `instructions` | Block markdown shown below the fill-in rows |
| `placement` | `pre-body` — standalone cover page |

#### `exam-title-section`
Compact two-column exam header (title + meta left, student fill-in right). Content flows immediately below on the same page. Fields identical to `exam-title-page` (the `placement` field is not used).

#### `question-mc`
Multiple-choice question with compact one-line header and auto-column options grid.

| Field | Notes |
|-------|-------|
| `n` ✱ | Question number; plain text (e.g. `1`, `2a`) |
| `pts` | Point value; plain text (e.g. `5 pts`) |
| `body` ✱ | Question stem; block markdown (KaTeX supported) |
| `options` ✱ | Multiline list — one option per non-empty line; start each with a letter label (`A. text`) or let them be lettered automatically |
| `answer` | Correct option letter (e.g. `B`); shown as ✓ with colored text only when `answer-key=show` |

Options are displayed in a two-column grid. The grid automatically collapses to single-column when any option text exceeds ~40 characters.

#### `question-open`
Open-ended / short-answer question with a blank writing space.

| Field | Notes |
|-------|-------|
| `n` ✱ | Question number |
| `pts` | Point value |
| `body` ✱ | Question text; block markdown |
| `space` | CSS height of the blank area; default `3cm` |
| `answer` | Model answer; block markdown; shown only when `answer-key=show` |

---

## Dynamic Switch

The `dynamic_choices` document setting is a key-value map that drives conditional rendering. Elements can emit `data-show-when` and `data-hide-when` attributes that are resolved at processing time against the choices.

```
{{nyml
kind: document
dynamic_choices: |
  answer-key: hide
  audience: student
}}
```

**Attribute behavior:**

- `data-show-when="key=value"` — element is **removed** unless the choice matches; attribute is stripped when it matches.
- `data-hide-when="key=value"` — element is **removed** if the choice matches; attribute is stripped when it does not match.

Key normalization: hyphens are converted to underscores, case is lowercased (`answer-key` → `answer_key`).

**Common pattern — exam answer key:**

```
{{nyml
kind: document
dynamic_choices: |
  answer-key: hide    ← student copy
}}
```

Change to `answer-key: show` to produce the instructor answer key with all ✓ marks and model answers revealed.

**Custom elements** (`kind: define-element`) can embed `data-show-when` / `data-hide-when` directly in their `html:` template.

> **Note:** The `html:` block in a `define-element` is raw HTML — markdown syntax like `**bold**` is not parsed there. Use `<strong>bold</strong>`, `<em>italic</em>` etc. directly. Field values of type `markdown` or `markdown-inline` are rendered through the markdown engine before substitution.

---

## Recommended Combinations

### Academic paper / article

```
template: academic          → system serif, default theme
```
Elements: `academic-title-section`, `abstract`

### Thesis / dissertation

```
template: default           → Noto Serif, light-academic-1
font_heading_preset: raleway
```
Elements: `thesis-title-page` (placement: pre-body), `toc` (placement: pre-body), `abstract` (placement: pre-body)

### Editorial journal article

```
template: beige-journal     → Lora + Raleway, beige-decent-1, A4
decoration_color: "#8b7355"
```

### Literary book / novel

```
template: beige-book        → Crimson Pro + Lora, beige-decent-1, Letter
decoration_color: "#8b7355"
footer_left: "Author Name"
```

### Formal letter

```
template: default
first_page_hide_footer: true
```
Elements: `letterhead` or `letterhead-academic`, `letter-inside-address`, `letter-signature`

### Classic single-column CV

```
template: cv-linear
decoration_color: "#1a4a8a"
footer_left: "Your Name"
```
Elements (optional): `cv-header` or any `cv-header-*` variant

### Sidebar CV

```
template: cv-sidebar
decoration_color: "#2a6496"
```
Element (required, first in document): `cv-sidebar-layout`

### Exam — student copy

```
template: default
decoration_color: "#2962a4"
dynamic_choices: |
  answer-key: hide
```
Elements: `exam-title-page` (placement: pre-body), then `question-mc` and `question-open`

Change `answer-key: hide` → `answer-key: show` for the instructor answer key.

### Handwritten / notebook note

```
template: handwritten-note  → Neucha, light-playful-1, ruled background
```

### Modern casual note

```
template: casual-note       → Lora, light-neat-1
decoration_color: "#2e8bcf"
```

---

## Preview Workflow

```bash
cd pipeline-model
npm run preview                          # default: test/core-smoke.md on port 3000
node src/preview-server.js test/exam-sample.md
node src/preview-server.js test/exam-sample.md 3001
```

## Conversion Commands

```bash
npm run parse   -- test/sample.md               # HTML fragment to out/
npm run convert -- test/sample.md out/out.pdf   # full PDF
npm run embed   -- out/out.pdf test/sample.md out/embedded.pdf  # embed source
```

## Legacy Archive

The previous Phase I implementation is preserved at `archive/phase1-legacy/` for reference and regression comparison only. Do not develop features there.

```bash
npm run preview:legacy
npm run convert:legacy
```

## Test Samples

| File | Demonstrates |
|------|-------------|
| `test/core-smoke.md` | Core settings, page numbering, math, Mermaid, standard Markdown |
| `test/sample.md` | General document layout |
| `test/academic-template-sample.md` | `academic-title-section`, `abstract`, thesis elements |
| `test/academic-thesis-template-sample.md` | Full thesis with `toc`, page numbering from chapter 1 |
| `test/book-technical-template-sample.md` | `beige-book` template, long-form prose |
| `test/cv-linear-sample.md` | `cv-linear` template with `cv-header` |
| `test/cv-sidebar-template-sample.md` | `cv-sidebar` template with `cv-sidebar-layout` |
| `test/cv-header-styles-sample.md` | All five `cv-header-*` variants side by side |
| `test/exam-sample.md` | Full exam: `exam-title-page`, `question-mc`, `question-open`, dynamic answer key |
| `test/dynamic-switch.md` | `define-element` custom elements with `data-show-when` / `data-hide-when` |
| `test/markdown-vs-builtins-sample.md` | Parser-native blocks vs. built-in elements |

