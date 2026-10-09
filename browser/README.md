# orz-paged-browser

The browser engine and editor component of
[orz-paged](https://github.com/wangyu16/orz-paged) — Markdown laid out as print
pages ("Markdown that edits itself", for paper): the very bundle every
`.paged.html` file carries, and the same editor for web apps (orz family
contract FC-19). Built on the carrier kit of
[orz-markdown](https://www.npmjs.com/package/orz-markdown) 2.2 and
[Paged.js](https://pagedjs.org/) 0.4.3 (both bundled).

```sh
npm i orz-paged-browser@1
```

| File | What |
|---|---|
| `orz-paged.browser.js` | the IIFE. Sets `globalThis.OrzCarrier` = `{ kind: 'paged', version, formats, assemble, extract, readDocument, mountEditor, renderPreview, standalone }`. Inside an assembled `.paged.html` it also starts that file (orz-markdown `carrier/app`): the read view — the document laid out as Paged.js pages in the page, print-ready —, Edit (the editor with a Paged.js preview), Print, Save, Download a copy, New document, New document from template…, Save as new copy, the header settings (theme, page size, template, page numbers, version), the page zoom, host protocols and the quiet update; `OrzCarrier.standalone` is then the file's handle, `null` elsewhere. Anywhere else it only sets the global. |
| `esm/orz-paged.browser.mjs` | the same API as ES module exports, plus `OrzCarrier`, `THEMES`, `DEFAULT_THEME`, `TEMPLATE_IDS`, `DEFAULT_TEMPLATE`, `newDocument` and `editHeader`. Sets no global and boots nothing. |
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

Embedding guide (hooks, the Paged.js preview frame, CSP, versions):
`docs/embedding.md` in this package
([on GitHub](https://github.com/wangyu16/orz-paged/blob/main/docs/embedding.md)).
Versioned in lockstep with `orz-paged`; built by its `build/bundle.ts`.

## License

MIT
