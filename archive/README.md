# archive — the 0.x design documents

These documents describe orz-paged before the 1.0 rebuild (text format 1, the
orz-markdown carrier kit). They are kept for their history and as the
specification some of the code was written from; **they are not the current
truth** — where they disagree with the README, the skill or the code, those
win.

| File | What it was | Still true | The current truth |
|---|---|---|---|
| `DESIGN.md` | the 0.x source of truth: goals, the pipeline, the editor, print, the resolved decisions | print-first, light paper only, templates own layout and themes own the look, page break = `::: page-break`, PDF by the browser's print, the document layer reimplemented (not vendored) from orz-md-pdf | [README.md](../README.md), [CLAUDE.md](../CLAUDE.md), the family plan `../../docs/REBUILD.md` §3b |
| `PLAN.md`, `BUILD-PLAN.md` | the 0.x module plan and build order | nothing (done, then rebuilt) | [notes/CLAIMS.md](../notes/CLAIMS.md) (what is built and proven) |
| `document-model.md` | orz-md-pdf's document model (settings, elements), the spec the document layer curates from | the settings keys, aliases and defaults and the element fields that `src/doc/*` implements | `src/doc/settings.ts`, `src/doc/elements.ts`, `src/doc/page-css.ts`; the header keys in [the skill](../orz-paged-skills/SKILL.md); orz-markdown `spec/FC-18-text-format-1.md` §5.1 |
| `supported-features.md` | orz-md-pdf's feature list (upstream, never orz-paged's) | — | [README.md](../README.md), [the skill](../orz-paged-skills/SKILL.md) |
| `dom-contract.md` | the 0.x DOM and CSS contract between the document layer, the themes and the 0.x editor | the page model (Paged.js' `.pagedjs_page` boxes), the element classes (`.orz-el-*`), the CSS tokens (`--page-bg`, `--accent`, `--font-*`, `--text-main`, `--heading-color`) | `assets/themes/layers/structure.css`, `src/doc/page-css.ts`, [assets/themes/README.md](../assets/themes/README.md); the 0.x editor parts are gone (the editor is orz-markdown's `carrier/editor`) |
