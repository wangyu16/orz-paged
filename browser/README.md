# orz-paged-browser

The browser engine and editor component of
[orz-paged](https://github.com/wangyu16/orz-paged) — Markdown laid out as print
pages ("Markdown that edits itself", for paper): the very bundle every
`.paged.html` file carries, and the same editor for web apps (orz family
contract FC-19). Built on the carrier kit of
[orz-markdown](https://www.npmjs.com/package/orz-markdown) 2.3.0 and
[Paged.js](https://pagedjs.org/) 0.4.3 (both bundled: this release embeds
orz-markdown 2.3.0).

```sh
npm i orz-paged-browser@1
```

| File | What |
|---|---|
| `orz-paged.browser.js` | the IIFE. Sets `globalThis.OrzCarrier` = `{ kind: 'paged', version, formats, assemble, extract, readDocument, mountEditor, renderPreview, printDocument, standalone }`. Inside an assembled `.paged.html` it also starts that file (orz-markdown `carrier/app`): the read view — the document laid out as Paged.js pages in the page, print-ready —, Edit (the editor with a Paged.js preview), Print, Save, Download a copy, New document, New document from template…, Save as new copy, the header settings (theme, page size, template, page numbers, version), the page zoom, host protocols and the quiet update; `OrzCarrier.standalone` is then the file's handle, `null` elsewhere. Anywhere else it only sets the global. |
| `esm/orz-paged.browser.mjs` | ES module exports: `kind`, `version`, `formats`, `assemble`, `extract`, `readDocument`, `renderPreview`, `mountEditor`, `printDocument(html, { nonce })` — print a paged document from an app (the editor's `print` event; it lays the pages out in a hidden frame and opens the print dialog), `OrzCarrier` (the same object without `standalone`), `THEMES`, `DEFAULT_THEME`, `TEMPLATE_IDS`, `DEFAULT_TEMPLATE`, `newDocument`, and `editHeader(text, changes)` — change header keys in a text the way the pencil's settings do (one line per key, the rest of the text untouched; `null` removes a key). Sets no global and boots nothing. |
| `release.json` | the release manifest the quiet update reads: `kind`, `version`, `formats`, `notes`, and `bundle.path` / `bundle.integrity` (the SHA-384 of `orz-paged.browser.js`'s exact bytes). |
| `index.d.ts` | types (`Editor`, `EditorOptions`, `EditorHooks`, `AiProposal`, …). |

```js
import { mountEditor } from 'orz-paged-browser';   // a bundler: the ES module
const editor = mountEditor(element, { text, nonce, hooks: { async save(text) { /* store the text */ } } });
```

```html
<script src="https://cdn.jsdelivr.net/npm/orz-paged-browser@1.0.0/orz-paged.browser.js"></script>
<script>const editor = OrzCarrier.mountEditor(element, { text, hooks: { save } });</script>
```

`.paged.html` files carry the bundle inline (the CLI's default) or load it
from `https://cdn.jsdelivr.net/npm/orz-paged-browser@<version>/orz-paged.browser.js`
(`--cdn`); the print themes are inside the bundle, so both style the same.
The bundle holds no `<script` / `</script`, no CR and only ASCII, so it can be
inlined byte for byte and checked against `release.json`.
`require('orz-paged-browser')` is not supported (it throws): use `import` or a
`<script>` tag.

## Browsers, delivery and limits

- **Reading, printing and editing work in every modern browser** (Paged.js
  lays the pages out the same way; Chromium gives the most faithful PDF).
  **Save in place** needs Chromium (Chrome, Edge, …: the File System Access
  API): the first Save asks where the file is (a file picker), later saves
  write it directly; elsewhere Save downloads the file. A page served over
  http(s) never saves in place (*Download a copy*).
- **CDN dependence.** Even an inline file (the engine, Paged.js and the print
  themes inside) loads the webfonts, KaTeX's and highlight.js's styles,
  Mermaid / SMILES / Chart.js and the CodeMirror editor from CDNs; a `--cdn`
  file also loads the engine. **Offline**, the pages are laid out after about
  2 s in fallback fonts (page breaks can differ), formulas unstyled and
  drawings missing; editing uses a plain text area.
- **Content-Security-Policy.** Under a nonce policy pass your nonce as
  `mountEditor(element, { nonce })` (and to `printDocument`); the component
  stamps it on its scripts and styles and on the preview frame's. The tested
  policy and what loads from where: `docs/embedding.md`,
  "Content-Security-Policy".
- **Print-first by design**: light themes only; tabs, spoilers and video are
  discouraged (they hide content or do not print). There is no layout report
  (page count, overflow) in the package or the CLI.
- **Files are programs.** A `.paged.html` runs the engine and any raw HTML in
  its document: open only trusted files; show `renderPreview` output only in
  a sandboxed frame.

Embedding guide (hooks, the Paged.js preview frame, CSP, versions):
`docs/embedding.md` in this package
([on GitHub](https://github.com/wangyu16/orz-paged/blob/main/docs/embedding.md)).
Versioned in lockstep with `orz-paged`; built by its `build/bundle.ts`.

## License

MIT
