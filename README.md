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

## Security — treat these as programs, not documents

A `.paged.html` is **self-contained executable HTML**: opening one runs the
JavaScript embedded in it (the engine, the editor, and — because the parser allows
raw HTML in the source — potentially anything in the content). The trust model is
the same as **running a downloaded program**, not opening a PDF.

- **Only open or edit files from sources you trust.** Anyone can craft a file that
  looks authentic (same chrome, logo, layout) but contains hostile code. The
  format has no built-in authenticity — appearance proves nothing.
- **What the browser limits.** A page can't run native code or read your disk
  silently (Save uses the File System Access prompt and is scoped to the file you
  pick). Realistic harm from a hostile file is web-context — phishing, exfiltrating
  what you type or paste, beaconing — within the browser sandbox.
- **The one-click update is opt-in and fixed-source.** It only checks for and
  fetches a new framework after you enter edit mode and click **Update**, always
  from the canonical jsDelivr packages over HTTPS (the source is hardcoded in the
  engine — a tampered file cannot redirect it), and it shows the exact URLs for
  confirmation first. Clicking Update places trust in npm + jsDelivr for those
  packages.
- **Integrity can't be self-verified.** A file cannot prove its own integrity (a
  forgery would just lie). If you need authenticity, verify it out-of-band — a
  checksum or signature from the publisher over a trusted channel.

## License

TBD.
