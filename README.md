# orz-paged

> **Status: published (v0.1.0) and browser-verified** — 12 starter templates,
> 7 light themes, the full document-element set, an in-file editor with a
> template picker, and a dynamic switch (e.g. exam answer keys). Two packages
> publish in lockstep: [`orz-paged`](https://www.npmjs.com/package/orz-paged)
> and [`orz-paged-browser`](https://www.npmjs.com/package/orz-paged-browser).
> See [DESIGN.md](./DESIGN.md) for the design.

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
- **Curated, not sprawling.** A dozen common templates + seven light themes (shared
  with the orz family) + a clear agent skill, rather than every option — but every
  element/theme/setting stays independently composable for power users and agents.

## Pipeline (all in the browser)

```
Markdown ──orz-markdown──► content HTML
         ──pipeline-model─► paged HTML (page config, headers/footers, elements, fonts, theme)
         ──paged.js───────► .pagedjs_page boxes  (the visible pages — and what prints)
```

## Commands

```
orz-paged <input.md> [-o out.paged.html] [--inline | --cdn] [--title t]
orz-paged --template <name> [-o out.paged.html]   # scaffold + render a starter document
orz-paged --new <name> [-o out.md]                # write a starter .md you then edit
orz-paged --list-templates                        # list the templates
```

`--inline` (default) embeds the engine + paged.js + every theme. `--cdn` instead
references jsDelivr for the published `orz-paged-browser` engine + theme.
**Fonts, web images, and math/diagram libraries always load from CDN** (internet
assumed) — so files stay small. The document's `{{nyml kind: document}}` block
(`template:`, `theme:`, …) is the source of truth.

## Templates & themes

**Clear split:** a **template owns layout** (page size, furniture, which elements
appear and where) and a **theme owns the look** (font, decoration color, element
styling) — so the same theme renders the same across every template.

Twelve starter **templates** scaffold a real document, not just defaults —
`article`, `report`, and `exam` each in a **title-page** and a **title-section**
variant, three CV styles (`cv` classic, `cv-modern`, `cv-elegant`), plus
`letter`, `cover-letter`, and `note`. Pick one with `--template <name>`, or in the
in-file editor from the **template picker** (the 📄 toolbar button); the picker
drops the starter into the editor (keeping any existing content in a comment).

Seven light **themes** are vendored from orz-markdown and print-adapted —
`light-neat-1/2/3`, `light-academic-1/2`, `beige-decent-1/2` — selectable per
document (`theme:`) or live in the editor (switching swaps font + color + style
together). The **default is `light-academic-1`**. They are **light only by design**
(ink on paper); an explicit `font_preset` / `decoration_color` / `page_background`
still overrides a theme's font / accent / page tint.

## Dynamic switch — one source, several versions

A `dynamic_choices` document setting (a `key: value` map) drives conditional
content: elements tagged `data-show-when="key=value"` / `data-hide-when="key=value"`
are kept or dropped at render time. The headline use is **exam answer keys** — the
question answers are tagged `answer-key=show`, so one source prints both the
student copy (`answer-key: hide`) and the instructor key (`show`). Flip it in the
source, or live from the editor's **answer key** dropdown. Define your own keys for
any tailored-variant document.

## Authoring

A `{{nyml kind: document}}` block sets page size/margins, font, headers/footers,
page numbers, and a template/theme; `{{nyml kind: element}}` blocks insert
constructs like title sections, abstracts, letterheads, TOCs, CV headers, and exam
questions. orz-paged ships a **curated** subset of this model (the most common
templates/elements) with a clear agent skill — see
[DESIGN.md §8](./DESIGN.md). The full model orz-paged draws from is in
[docs/document-model.md](docs/document-model.md) (a spec reference from
orz-md-pdf).

## Use with an AI agent

The package ships an **agent skill** that teaches an AI agent the document format —
page templates, headers/footers, the curated elements (CVs, letters, exams), and
the dynamic switch. The quickest way to produce a document is to let an agent do it:

- **Any agent** — point it at
  `https://cdn.jsdelivr.net/npm/orz-paged/orz-paged-skills/SKILL.md`, then
  describe what you want.
- **Claude Code** — copy `orz-paged-skills/` into `~/.claude/skills/orz-paged/`
  from this repo or from the installed npm package.

More install routes: <https://markdown.orz.how/agents.html>

## Host embedding

`.paged.html` files conform to **`orz-host-save@1`**: a platform can embed a
document in an iframe, announce itself with a `postMessage` handshake, and
receive saves (`{ source, html }`) instead of the file-system path —
standalone behavior, Export to PDF, and downloads are unchanged, and nothing
activates without the handshake. The canonical spec lives in the orz-mdhtml
repo: [PROTOCOL.md](https://github.com/wangyu16/orz-mdhtml/blob/main/PROTOCOL.md).

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
