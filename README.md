# orz-paged

> **Status: MVP built and browser-verified.** `npm run build` then
> `npm run gen -- tests/sample.md` produces a working `.paged.html`. See
> [PLAN.md](./PLAN.md) for module status, [DESIGN.md](./DESIGN.md) for the design.

Generate a single, self-contained, **editable** `.paged.html` from Markdown — a
document shown as **print pages** in any browser (A4/Letter, real margins,
running headers/footers, page numbers), edited and saved **in the browser**, and
exported to PDF by **printing it** (no PDF binary, no Puppeteer).

It is the paginated-document sibling of:

- **[orz-mdhtml](../orz-mdhtml)** — a continuous document (`.md.html`)
- **[orz-slides](../orz-slides)** — a reveal.js deck (`.slides.html`)

and is authored in **[orz-markdown](../orz-markdown)**, the family's parser.

## How it differs from `.md.pdf`

The **orz-md-pdf** VS Code extension produces a `.md.pdf`: a real PDF binary with
the Markdown embedded inside, rendered by Puppeteer. **orz-paged keeps the file as
editable HTML** in a paged view; a PDF is produced only on demand, by the
browser's own `Print → Save as PDF`. It borrows orz-md-pdf's *document model* (as
a spec, reimplemented in TypeScript) and its paged.js pagination — not its PDF
binary, Puppeteer, or untested code.

## Principles

- **Print on light paper.** White or light-colored backgrounds only — **no dark
  mode**, no screen-only constructs (avoid tabs, spoilers, embedded video).
- **Assume internet.** Fonts, web images, and math/diagram libraries load from
  CDN at view/print time; files stay small.
- **Curated, not sprawling.** A small set of common templates + a clear agent
  skill, rather than every option.

## Pipeline (all in the browser)

```
Markdown ──orz-markdown──► content HTML
         ──pipeline-model─► paged HTML (page config, headers/footers, elements, fonts, theme)
         ──paged.js───────► .pagedjs_page boxes  (the visible pages — and what prints)
```

## Planned commands

```
orz-paged <input.md> [-o out.paged.html] [--theme … | --template …] [--inline | --cdn]
orz-paged --new                # welcome-template .paged.html
orz-paged --convert file.md    # convert an existing Markdown file
```

`--inline` (default) embeds the engine + paged.js + theme; `--cdn` references
jsDelivr for those. **Fonts, web images, and math/diagram libraries always load
from CDN** (internet assumed) — so files stay small. The document's
`{{nyml kind: document}}` block overrides flags.

## Authoring

A `{{nyml kind: document}}` block sets page size/margins, font, headers/footers,
page numbers, and a template/theme; `{{nyml kind: element}}` blocks insert
constructs like title sections, abstracts, letterheads, TOCs, CV headers, and exam
questions. orz-paged ships a **curated** subset of this model (the most common
templates/elements) with a clear agent skill — see
[DESIGN.md §8](./DESIGN.md). The full model orz-paged draws from is in
[docs/document-model.md](docs/document-model.md) (a spec reference from
orz-md-pdf).

## License

TBD.
