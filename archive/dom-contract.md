# DOM + CSS contract — orz-paged

The single truth shared by the **document layer** (emits the HTML/CSS), the
**themes** (style it), and the **editor** (hosts it). Change a class/structure/
token here *and* in all three together. Analogue of orz-slides' dom-contract.

## Page model (paged.js)

paged.js flows the body into page boxes. Do **not** author these — paged.js
creates them — but themes/print CSS target them:

```
.pagedjs_pages
  └─ .pagedjs_page                     one physical page
       ├─ .pagedjs_margin-top-*        running header margin boxes
       ├─ .pagedjs_area > .pagedjs_page_content   the flowed content
       └─ .pagedjs_margin-bottom-*     running footer margin boxes
```

`@page` rules (size, margins, margin-box `content`) come from **M5 `buildPageCss`**;
paged.js realizes them into the boxes above. Page numbers use `counter(page)` /
`counter(pages)` inside margin boxes.

## Document body (we author this)

```html
<main class="orz-doc markdown-body">
  <!-- orz-markdown content + rendered elements, in source order -->
  <section class="orz-element orz-el-<kind>"> … </section>   <!-- a concrete element kind -->
  <div class="page-break"></div>                              <!-- ::: page-break -->
  …
</main>
```

- **`.orz-doc.markdown-body`** wraps all content (required so orz-markdown's CSS +
  copy-as-Markdown apply; follow the embedding guide).
- **`.orz-element.orz-el-<kind>`** wraps each rendered concrete element kind. Element
  scoped CSS is injected **once per kind** (dedupe).
- **`.page-break`** (from `::: page-break`) → `break-before: page`.
- A title/cover element with `placement: page` carries the class
  **`.orz-place-page`** on its `.orz-element` section, which sets
  **`break-after: page`** (the canonical hook — `elements.ts` emits both the class
  and a scoped rule; themes mirror `.orz-element.orz-place-page`). *(Pre-body body-
  counter reset to 1 is deferred — see PLAN.md deferred items.)*

## TOC markup (filled by the runtime after pagination)

The `toc` element emits `<nav class="orz-toc" data-max-level="N"></nav>`. After
paginating, the engine fills it with:
`<ol class="orz-toc-list"><li class="orz-toc-item orz-toc-l<level>"><span class="orz-toc-text">…</span><span class="orz-toc-page">N</span></li>…</ol>`.
Themes style `.orz-toc-text` (with dot leaders) and right-align `.orz-toc-page`.

## CSS variables (`:root`, set per document from DocSettings)

| Token | From `DocSettings` | Use |
|---|---|---|
| `--page-size` | `pageSize` | `@page { size }` |
| `--margin-{t,b,l,r}` | `margin*` (mm) | `@page { margin }` |
| `--font-body` | `fontPreset`/`fontFamily` | body `font-family` |
| `--font-heading` | `fontHeadingPreset` | heading `font-family` |
| `--font-margin-box` | `fontMarginBoxPreset` | header/footer `font-family` |
| `--font-size` | `fontSize` (pt) | body size |
| `--line-height` | `lineHeight` | body leading |
| `--accent` | `decorationColor` | theme/element accent |
| `--page-bg` | `pageBackground` | page background (light only) |
| `--header-rule`, `--footer-rule` | `*RuleColor` | header/footer rules |

## Hard rules

- **Light only.** `--page-bg` is white or a light color; **no dark themes**, no
  `prefers-color-scheme: dark` overrides.
- **Print-first.** No interactive constructs (tabs/spoiler/youtube) in templates
  or the skill (DESIGN §9).
- **Editor chrome lives OUTSIDE** `.orz-doc` (and ideally outside the paged.js
  preview iframe) so paged.js's page CSS never touches it.
