# Supported Features

This file is the current machine-friendly and human-readable catalog of supported features in the rebuilt `pipeline-model` core.

It is intended for:

- AI agents that need a reliable list of allowed settings and choices
- human users who want to know what can be selected without reading source code

## Status

Current status: core pipeline only.

Implemented now:

- Markdown parsing through `@orz-how/markdown-parser`
- document-level settings
- local bundled font presets
- page layout and running header/footer
- page numbering
- live preview server
- PDF conversion
- PDF embed round-trip

Not rebuilt yet in the new core:

- theme registry
- built-in element registry
- template registry
- custom `define-element` support

## Authoring Model

Use one `kind: document` NYML block for document-wide settings.

Example:

```markdown
{{nyml
kind: document
page_size: A4
font_preset: roboto
font_size: 11.5
line_height: 1.5
header_center: Example Document
page_number_position: footer-center
page_number_style: page-n
}}
```

## Supported Document Settings

### Page layout

- `page_size`
- `margin_top`
- `margin_bottom`
- `margin_left`
- `margin_right`

Supported `page_size` choices:

- `A3`
- `A4`
- `A5`
- `Letter`
- `Legal`
- custom size string such as `210mm 297mm`

Accepted aliases are normalized internally, for example:

- `letter` → `Letter`
- `legal` → `Legal`
- `a4` → `A4`

### Typography

- `font_preset`
- `font_family`  ← advanced override only
- `font_size`
- `line_height`

### Running header and footer

- `header_left`
- `header_center`
- `header_right`
- `footer_left`
- `footer_center`
- `footer_right`
- `header_rule`
- `footer_rule`
- `header_rule_color`
- `footer_rule_color`
- `header_font_size`
- `footer_font_size`

Header and footer content is plain text.

### Page numbering

- `page_number_position`
- `page_number_style`
- `page_number_start_page`
- `first_page_skip_number`

Supported `page_number_position` choices:

- `header-left`
- `header-center`
- `header-right`
- `footer-left`
- `footer-center`
- `footer-right`
- `none`

Supported `page_number_style` choices:

- `simple`
- `page-n`
- `page-n-of-N`
- `n-of-N`
- `n-slash-N`
- `dash-n-dash`
- `brackets`
- `parentheses`

### Margin-box visibility behavior

- `first_page_hide_header`
- `first_page_hide_footer`
- `pre_body_hide_header`
- `pre_body_hide_footer`

### Flow behavior

- `limit_image_to_page`
- `keep_image_together`
- `repeat_table_header`
- `avoid_table_row_breaks`

### Dynamic switches

- `dynamic_choices`

This is parsed now, but the rebuilt core does not yet provide the full element/template layer that will make broader use of it.

## Supported Font Presets

Only curated local presets are supported.

Arbitrary user-provided web-font URLs are not supported.

### Tier A

- `system-serif`
- `inter`
- `source-serif-4`
- `ibm-plex-sans`
- `roboto`
- `raleway`
- `lora`
- `crimson-pro`
- `courier-prime`
- `comic-neue`
- `neucha`
- `noto-serif`
- `noto-sans`
- `noto-serif-sc`
- `noto-sans-sc`
- `noto-serif-tc`
- `noto-sans-tc`

### Tier B

- `lxgw-wenkai-tc`
- `ma-shan-zheng`

### Font aliases accepted and normalized

- `relaway` → `raleway`
- `lori` → `lora`
- `courier` → `courier-prime`
- `source-serif-1` → `source-serif-4`

## Themes

Themes control how rendered content looks — colors, relative font sizes, heading decoration, callout palette, and code block style. They do not affect page layout, page background, or font family (those are controlled by other settings).

Set with:

```
theme: light-academic-1
```

To disable: `theme: none` or `theme: ""` or omit the key entirely.

### Available themes

| Name | Character |
| --- | --- |
| `light-academic-1` | Tufte-inspired serif. Justified text, asterism `* * *` hr, h3 small-caps, dark-ink palette |
| `light-academic-2` | Minimal structured academic. Bold h1/h2 underline borders, navy links, clean blockquote |
| `light-neat-1` | Modern blue-accent. Gradient heading decorations, pill h4, round accent bullets, pill tabs |
| `light-neat-2` | Warm earthy teal. `SECTION` label on h1, pill h3, diamond bullets, dashed hr |
| `light-playful-1` | Warm handwritten/notebook. Sticky-note callouts with tape, rotated headings |
| `light-playful-2` | Neobrutalist/pop-art. Hand-drawn borders, bold box-shadows, rotated headings |
| `beige-decent-1` | Warm editorial/bookish. Centered h1, bifurcated blockquote, feathered hr |
| `beige-decent-2` | Warm modern. Teal links, pill tabs, rounded corners, clean left-border callouts |

### What themes affect

- content text color and heading colors
- relative font sizes (em/rem scales only — body size is still set by `font_size`)
- heading decoration (borders, pseudo-elements, pill shapes, small-caps)
- callout container background/border/text colors
- inline code and code block color palette
- blockquote style
- `hr` style
- span badge appearance
- tab and column UI chrome

### What themes do not affect

- page layout or page dimensions
- page background (controlled by `page_background` + `page_background_effect`)
- font family (controlled by `font_preset` / `font_heading_preset`)
- margin box (header/footer) styling

## Currently Supported Markdown And Parser Features

The rebuilt core currently supports normal parser output from `@orz-how/markdown-parser`, including common authoring patterns such as:

- headings
- paragraphs
- lists
- tables
- code blocks
- blockquotes
- KaTeX math
- Mermaid diagrams
- tabs
- standard parser-native containers such as `::: info`

Support here means the parser output is carried through the rebuilt core pipeline. It does not imply that all future theme, built-in, or template-level styling work is finished.

## Built-in elements and templates

Built-in elements are available and can be used together with templates to create articles, books, formal letters, CV, exams, etc. 

## In-document define-element

Support in-document define-element feature to create specifically structured block and use it within the document. 

## Canonical Preview Workflow

```bash
cd pipeline-model
npm run preview
```

Default source:

- `test/core-smoke.md`

Default port:

- `3000`

## Design Rules For AI Usage

When using this feature list to guide AI-assisted authoring:

- use `font_preset`, not arbitrary web-font URLs
- use canonical preset names when possible
- use one `kind: document` block for document-wide settings
- treat unsupported themes, elements, and templates as not yet available in the rebuilt core