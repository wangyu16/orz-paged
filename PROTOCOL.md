# Host protocols — orz-paged

The host protocols `orz-host-save@1`, `orz-host-ai@1` and
`orz-host-include@1` are specified once for the whole orz family in
orz-markdown:
**[`spec/host-protocols.md`](https://github.com/wangyu16/orz-markdown/blob/main/spec/host-protocols.md)**
(also in the installed package: `node_modules/orz-markdown/spec/host-protocols.md`).
That document is canonical — messages, handshake, security rules on both
sides, format-1 saves, versioning. This file used to hold the paged part of
the include protocol; it now lists only what is particular to orz-paged. A
host implements the protocols with orz-markdown's `embedCarrierFrame`
(`orz-markdown/carrier/shell`); the file side is built into every
`.paged.html` (orz-markdown `carrier/app`, as in every carrier). This file is
shipped in the `orz-paged` package.

## What an orz-paged file does (1.0, text format 1)

- **Kind** `paged` in every `ready` (spec §2).
- **All three protocols** are answered, and only in a frame
  (`window.parent !== window`) after the host's hello (spec §6).
- **Save** (`orz-host-save@1`, spec §3, §7): `source` is the exact text twin
  (`x.paged.md`) and `html` is `assemble(source)` with the file's delivery and
  its `#orz-includes` record — the same bytes a file save would write, never
  the laid-out pages. Saves from the read view (a header setting from the
  pencil's list: Theme, Page size, Template, Page numbers, Version) and from
  the editor both go to the host; the dirty state is posted. A hosted file
  never shows a file picker and never checks for updates. `theme` may be
  omitted: the text's header holds it. Persist the text; the HTML can always
  be regenerated. The reader's *Page zoom* is never part of a save.
- **AI** (`orz-host-ai@1`, spec §4): the host's operations appear as an **AI**
  menu in every editor of the file. A result is shown in a review panel; the
  document changes only when the reader applies it, as one undoable edit.
- **Include** (`orz-host-include@1`, spec §5): the read view and the editor's
  page preview ask the host for URL includes (`{{md https://…}}`,
  `{{markdown …}}`, `{{md-include …}}`) before laying out the pages; the
  host's answer wins, and the file's `#orz-includes` record (resolved at
  assembly) is the fallback. The text keeps the directive. A standalone file
  never fetches an include URL.

## Older files

orz-paged 0.x files (before text format 1, up to 0.7.3) spoke version 1 of
`orz-host-save` and, from 0.7.0, `orz-host-include` (resolving
`{{md-include https://…}}` for the preview while keeping the raw directive in
the saved source): their `source` is the Markdown of the 0.x island, with the
settings block wherever the author put it. Upgrade them with `orz-paged
upgrade` (README, "Migrating from 0.x").
