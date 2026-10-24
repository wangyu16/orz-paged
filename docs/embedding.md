# Embedding the orz-paged editor in a web app

`orz-paged-browser` is the editor that every `.paged.html` file carries,
packaged for web apps (family decision FD-06; contract FC-19 in orz-markdown
`spec/FC-19-editor-component.md`). An app mounts it in its own page, keeps the
**text** (the canonical document, FC-18) wherever it likes, and makes
assembled `.paged.html` files only when someone needs one. The editor is
orz-mdhtml's (the kit's editor shell) with one difference: its preview shows
the document as **print pages**, laid out by Paged.js 0.4.3 in the preview
frame (see [The Paged.js preview](#the-pagedjs-preview)).

This guide ships in both packages (`node_modules/orz-paged-browser/docs/embedding.md`,
`node_modules/orz-paged/docs/embedding.md`). A working example:
[`examples/webapp/`](https://github.com/wangyu16/orz-paged/tree/main/examples/webapp) — two editors on
one page with every hook, under a nonce Content-Security-Policy
(`index.html`, IIFE) and the ES module variant (`esm.html`). The test suite
runs both in real Chrome (`tests/webapp.test.ts`).

## Install and load

```sh
npm install orz-paged-browser@1   # or: npm i orz-paged-browser@1
```

| You want | Use | Resolves to |
|---|---|---|
| a bundler (Vite, esbuild, webpack) | `import { mountEditor } from 'orz-paged-browser'` | `esm/orz-paged.browser.mjs` (`exports` → `import`) |
| a plain `<script>` | `<script src=".../orz-paged.browser.js">` → `globalThis.OrzCarrier` | `orz-paged.browser.js` (`exports` → `default`) |
| `require()` | not supported: it throws, pointing to `import` or `<script>` | `require.cjs` (`exports` → `require`) |
| the CDN | `https://cdn.jsdelivr.net/npm/orz-paged-browser@<version>/orz-paged.browser.js` (e.g. `@1.1.0`; pin an exact version) | the same IIFE |

Types: `orz-paged-browser/index.d.ts` (`Editor`, `EditorOptions`,
`EditorHooks`, …). The ES module sets no global and boots nothing; the IIFE
sets `globalThis.OrzCarrier` and — only inside an assembled `.paged.html` —
starts that file's own read view and chrome.

## Versions

**An app pins the component version it wants; files carry their own shells.**
Upgrading the package changes your editor, not anyone's files. The text format
(FC-18 format 1) is the only contract between them: a text written by any 1.x
editor opens in every other 1.x editor and assembles with any 1.x shell. The
quiet update indicator never appears in an app (FC-19 §5 invariant 6).

## Mount an editor

```ts
import { mountEditor } from 'orz-paged-browser';

const editor = mountEditor(element, {
  text,                       // the document, exact (BOM, line endings kept)
  mode: 'split',              // 'split' | 'editor' | 'preview' (else the reader's stored preference)
  chrome: 'full',             // 'full' (labels) | 'compact' (icons) | 'none' (your UI drives the API)
  readOnly: false,
  nonce,                      // your CSP nonce (FC-19 §3, see below)
  includes,                   // resolved includes for the preview: { 'parts/a.md': text, 'https://…': text } (FC-19 §3)
  fileName: 'notes.paged.html', // the suggested name of saves without hooks.save (picker, download); default document.paged.html
  hooks: { save, ai, fetchInclude, resolveAsset, uploadAsset, resolveLink, mintUid },
  // preferences: your PreferenceStore (default: localStorage, namespaced by the header uid)
});
```

Any number of editors per page: each has its own undo history, preview frame
and preferences namespace; nothing is global. The chrome renders in a shadow
root (your CSS cannot break it; it cannot restyle your page); the preview runs
in a sandboxed `srcdoc` frame (`sandbox="allow-scripts"`, an opaque origin:
document scripts cannot reach your page, storage or cookies).

The toolbar has the view modes, the paged settings — Theme, Page size,
Template (page size), Page numbers, Number style (they edit the header: `theme`,
`page_size`, `template`, `page_number_position`, `page_number_style`; one
undoable edit each) and, while the document offers versions (its content or
header uses `dynamic_choices`), **Version** (it writes the header's
`dynamic_choices` map) —, an **AI** menu when `hooks.ai` offers operations,
the save state and Save. Margins, fonts and custom CSS stay in the header
text. `chrome: 'compact'` shows the same tools as icons. Keyboard: Cmd/Ctrl+S saves, Cmd/Ctrl+\ cycles the modes,
Esc leaves the text for the toolbar.

### The `Editor` (FC-19 §4)

`getText()` · `setText(text, { resetHistory? })` · `setHeader(changes)` (one
undoable edit, FC-18 §9 rules) · `undo()` / `redo()` · `isDirty()` /
`markSaved()` · `save()` → `{ ok, via, error?, conflict? }` (`via`: `hook`, `host`,
`file`, `download`), never rejects · `setMode(m)` / `getMode()` · `focus()` ·
`on('change' | 'dirty' | 'selection' | 'save' | 'error' | 'print', fn)` → unsubscribe ·
`proposeAi(op, { selection? })` / `applyAi(proposal, { proposed? })` (the
review flow, below) · `requestAi(op, { selection? })` (propose and apply at
once) · `uploadAssets(files)` · `ensureUid()` · `setReadOnly(flag)` /
`isReadOnly()` · `refreshPreview({ includes? })` (render now; with `includes`
the preview's include record is replaced and every include read again — e.g.
after your app resolved one; saves keep the mounted includes) · `ready` (a
promise: the text engine is final, `{ engine: 'codemirror6' }` or
`{ engine: 'textarea', error }`; the editor is usable before) · `destroy()`.

### AI with a review step

The toolbar's AI menu never changes the document by itself. Choosing an
operation calls `proposeAi`: your `hooks.ai.request` runs and the editor gets
a **proposal** (`{ op, proposed, range, original, passage }`) without touching
the text. A review panel shows it — editable — with Apply and Cancel; Apply
calls `applyAi(proposal, { proposed })`, which writes it as **one undoable
edit**, and refuses (`{ ok: false }`) if the text changed since the proposal
was made. Your own UI can run the same flow:

```ts
const r = await editor.proposeAi('tighten', { selection: true });
if (r.ok && await myConfirm(r.proposal.original, r.proposal.proposed)) editor.applyAi(r.proposal);
```

## Hooks (FC-19 §3)

| Hook | Called | Return |
|---|---|---|
| `save(text)` | on Save / Cmd+S / `editor.save()` | a promise; reject to report a failure (the editor stays dirty). **With `save`, you own persistence**: nothing is written to disk or downloaded |
| `ai.operations`, `ai.request(op, { text, selection? })` | the AI menu and `editor.proposeAi` (the proposal is reviewed before `applyAi` writes it), `editor.requestAi` | `{ proposed }` — the replacement of the selection (`selection: true` operations) or of the whole text |
| `fetchInclude(target)` | the preview meets an include `includes` lacks: a URL (`{{md https://…}}` / `{{markdown …}}` / `{{md-include …}}`), or a file include's path as written (`{{md parts/a.md}}` → `'parts/a.md'`; you read your own files) | the Markdown, or `null`. Your trust policy (allowlist) decides |
| `resolveAsset(path)` | every relative `src` / `srcset` / `poster` in the preview, **synchronously** (the preview does not wait) | the URL to load, as a string — not a promise: a URL your app already knows (a `blob:` URL of a stored asset, a public URL, a URL signed beforehand) |
| `uploadAsset(file)` | a file pasted or dropped into the editor, `editor.uploadAssets` | the relative path to insert (`![name](path)` for images) |
| `resolveLink(href)` | a link clicked in the preview (as written, e.g. `week2.md`) | the URL to open |
| `mintUid()` | `editor.ensureUid()` when the header has no `uid` | a **promise** of a `doc-[0-9a-z]{10,32}` id from your registry (FC-18 §10) |

**Includes.** The preview reads an include from the `includes` option first
(target as written → text, like an assembled file's `#orz-includes`), then
asks `hooks.fetchInclude` — with the URL, or with the path as written for a
file include `includes` lacks. An include neither answers shows a quiet
"Included file not available: parts/a.md" note in the preview (the directive
is kept; a printed page hides the note).

Without `hooks.save` the editor saves like a standalone file: an inline
`.paged.html` (holding the `includes` you passed) through the File System Access
picker, else a download. Your app's page is not a served file: such a save
never shows the "opened from a web address" notice, even over https. If the
picked file is another copy of this document (same header `uid`) whose text
changed on disk since the editor opened it (another program or an agent
edited it), nothing is written: `save()` resolves `{ ok: false, via: 'file',
error: 'conflict', conflict: true }` and the editor asks the reader — **Replace
it** writes the file, **Download a copy instead** downloads one. (Mounted
inside an assembled `.paged.html` page, it is an editor of that file: it saves
through the file's own saver, delivery, includes and host — with the same
conflict question — the page's Cmd/Ctrl+S saves it, and its unsaved changes
make the page ask before it closes.)

## The Paged.js preview

The preview frame (FC-19 §8.4 pluggable preview) runs the **paged runtime** —
Paged.js 0.4.3 with orz-paged's two-column handler — as an inline script of
the frame document (carried by the bundle, nonce-stamped; nothing is fetched
for it). Each render: the editor renders the text in your page (settings,
elements, includes, page CSS, the print theme — pure data, no DOM) and posts
it to the frame; the frame's `window.__orzPreviewApply` lays it out as pages
(content libraries and webfonts loaded first; the first layout straight into
view, later ones from the first page the edit changed — the pages before it
kept, each new page swapped in as it is laid out, keeping the scroll
position) and the frame acknowledges the render as soon as it has taken it
(`diff: false`). A layout runs in the frame, which shares your page's
process: it starts 0.8 s after typing stops (`debounceMs` 800 ms,
which the editor grows to twice the time of its own render of the text) and
is never forced while keys keep arriving (`maxWaitMs: Infinity`). Paged.js
lays out one page per frame; the editor reports every edit to the frame (a
carrier message, `orz-paged-edit`), and a layout of an older text stops at
its next page — a newer render follows the next pause. So the edited page
shows about 1.2 s after the last key, also on a 35-page document, and the
rest follows within a few seconds; it is marked "updating…" (and
`aria-busy`) meanwhile; typing never waits for it. Fonts, stylesheets and
libraries are awaited at most 2 s; the pages then show with what has arrived
and are laid out once more when the rest settles (a server that never
answers is waited for once per session). The pages are scaled to the pane's
width; blocks keep their source lines (`data-src-line`), so scroll sync maps
a line to its page. The preview itself does not print and does not follow a
reader's page zoom.

### Printing the document

Cmd/Ctrl+P in the editor or its preview is the editor's `print` event
(orz-markdown 2.3.0): without a listener the browser prints **your page**.
To print the document's pages, listen and hand a print document to
`printDocument` (the kit's helper, re-exported by this package and on the
IIFE global): `renderPreview(text, { document: true, pages: true, nonce })`
is a small document that carries the paged runtime and lays the pages out
where it is opened, resolving `window.__orzPrintReady` when they are final;
`printDocument` opens it in a hidden `allow-scripts allow-modals` frame (an
opaque origin: its scripts cannot reach your page), waits for the load, the
fonts and `__orzPrintReady`, and calls the frame's own `print()` — the
browser prints those pages alone.

```js
let printing = null;
editor.on('print', () => {
  if (printing) return;                     // one print at a time
  printing = OrzCarrier.renderPreview(editor.getText(), { document: true, pages: true, nonce, fetchInclude })
    .then((html) => OrzCarrier.printDocument(html, { nonce }))   // true once printed
    .finally(() => { printing = null; });
});
```

An assembled file works too (`printDocument(await assemble(text), { nonce })`:
the file boots in the frame and sets `__orzPrintReady` to its final layout),
but it is about 1.7 MB inline; the print document is the light path. Under a
nonce policy pass the same nonce to both calls (the frame inherits your
policy). The example app (`examples/webapp/`) wires it for both editors.

The document's own raw HTML runs only inside the frame (an opaque origin in
your page), never in your page: the layout happens there.

## Content-Security-Policy (FC-19 §8.4)

The preview frame is a `srcdoc` frame: it inherits your page's policy. With a
nonce policy, pass the nonce as `nonce` (FC-19 §3): the component stamps it on
CodeMirror's `<script>` and `<style>` and on every script and style of the
preview frame — the bridge, the paged runtime, the libraries the runtime loads
and the `<style>` elements Paged.js inserts (the runtime stamps them). Without it, a nonce or hash policy blocks the preview frame's
inline scripts and the editor reports it (`error` event, source `render`;
its message may name the kit's option `preview.nonce` — here the option is
`nonce` on `mountEditor`). A tested policy (one header value; replace
`RANDOM` with a fresh nonce per response; `examples/webapp/` uses its own
variant — `frame-src 'self'` for its demo frame instead of YouTube, plus
`base-uri 'none'; form-action 'none'`, which you may add too):

```
default-src 'none'; script-src 'nonce-RANDOM' 'strict-dynamic'; style-src 'self' 'nonce-RANDOM' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://cdn.jsdelivr.net https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://cdn.jsdelivr.net; frame-src https://www.youtube.com
```

Why each part:

- `script-src` with `'strict-dynamic'`: the nonce also covers the scripts the
  component loads (CodeMirror, the preview libraries).
- `style-src-attr 'unsafe-inline'`: Paged.js, KaTeX and the diagram
  libraries write style attributes.
- `font-src`: the print themes' webfonts (Google Fonts), a font preset's
  (jsDelivr) and KaTeX's.
- `img-src`: must cover wherever `hooks.resolveAsset` points.
- `frame-src https://www.youtube.com`: only if your documents embed YouTube
  videos (`{{youtube …}}`: the player is a youtube.com/embed frame; on paper
  it prints as the video's address); drop it otherwise.

The same value works in a `<meta http-equiv="Content-Security-Policy">` tag.

**Use a nonce, not hashes.** `mountEditor` takes no hash list. An app that
builds its own preview frame with the kit (`orz-markdown/carrier/editor`'s
`PREVIEW_BRIDGE_HASH`, `previewScriptHashes`) must take the hash from the
same orz-markdown version its frame runs: the bridge, and so its hash,
differs between kit versions (orz-paged 1.1 embeds 2.5.0; 1.0 embedded
2.3.0). When the policy blocks the preview, the editor says so about a
second after the frame loads (orz-markdown 2.5.0): its `error` event names
the `nonce` option of `mountEditor` and the frame's own script hashes.
Tested in Chrome: the editor (CodeMirror 6) and the Paged.js preview with
math, code highlighting, Mermaid, Chart.js and SMILES render with no
violation but one — Mermaid's run-time `<style>` (below).

What loads from where: CodeMirror 6 from
`cdn.jsdelivr.net/npm/orz-markdown@<version>/vendor/codemirror6.js` (pinned,
SRI-checked; a textarea until it arrives); the print themes are inside the
bundle (no theme fetch), their webfonts from Google Fonts
(`fonts.googleapis.com` stylesheets, `fonts.gstatic.com` fonts) and a font
preset's from jsDelivr (`@fontsource`); KaTeX CSS from
jsDelivr, highlight.js from cdnjs, Mermaid / Chart.js from jsDelivr, SMILES
from unpkg (the preview libraries; with `'strict-dynamic'` the nonce covers
them). Mermaid inserts `<style>` elements at run time that nobody stamps; a
nonce policy blocks them and the diagram is drawn unreadable (black shapes). If your documents use diagrams, add a
`style-src-elem` directive that repeats the style sources **without a nonce**
(with a nonce present, `'unsafe-inline'` is ignored; and `style-src-elem`
replaces `style-src` for `<style>` and stylesheet links, so it must list them
all):

```
style-src-elem 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com;
```

## Without an editor

```ts
import { assemble, extract, readDocument, renderPreview, printDocument, newDocument, TEMPLATE_IDS, includeTargets, linkTargets } from 'orz-paged-browser';

readDocument(text)                        // header + derived facts (title, author, uid, theme, lint) — no rendering; index with it
await renderPreview(text, { includes, fetchInclude })  // the content's HTML (<main class="orz-doc markdown-body">, the header's version applied), not paginated
await renderPreview(text, { document: true })          // a whole HTML document: print theme, page and element CSS, no script, not paginated (iframe srcdoc, thumbnails)
await renderPreview(text, { document: true, nonce })   // the same, its <style> stamped with your CSP nonce (a srcdoc frame inherits your policy)
await renderPreview(text, { document: true, pages: true, nonce })  // a print document: the paged runtime lays out the pages where it opens (for printDocument)
await printDocument(html, { nonce })                   // print a whole document from your page, never your page (see "Printing the document")
newDocument({ template: 'exam-section', title })      // a new text from one of the 12 templates (TEMPLATE_IDS): carrier paged, a fresh uid
await assemble(text, { delivery: 'cdn' })              // a small .paged.html that loads the engine from jsDelivr
await assemble(text)                                   // an inline .paged.html (fetches this release's bundle once, or pass engineSource)
await assemble(text, { includes })                     // with resolved includes in #orz-includes
extract(html)                                          // { text, kind, format, shell, delivery, includes, twinLinks } | null
includeTargets(text)                                   // the include directives' targets, as the renderer finds them
linkTargets(text)                                      // [{ href, line, kind: 'twin' | 'asset' | 'other', image, raw }]: every link and image
```

**Link names of a published site** (orz-markdown 2.5.0, FC-18 §8.2). By
default a link to a text twin points at the family's name (`next.paged.md`
→ `next.paged.html`). An app that publishes pages under other names passes a
naming — `{ paged: '{stem}.html' }`: `next.paged.md` → `next.html`; a kind
left out keeps the family's name — as `twinLinks` to `assemble`,
`renderPreview` and `mountEditor` (the preview names links so; with
`hooks.resolveLink` your resolver gets the source href instead). `assemble`
stores it in the file (`extract(html).twinLinks`), and the file keeps it in
every save, copy and update. (`renderPreview(text, { twinLinks: false })`
leaves links as written.)

Pages need the engine's layout (Paged.js runs in the editor's preview frame
and in an assembled file's read view), so `renderPreview` is not paginated:
a continuous, styled view for thumbnails and lists (except `pages: true`, a
print document that carries the paged runtime). `renderPreview` adds no
other script of its own, but it keeps the document's raw
HTML as written — a document can hold `<script>` and event handlers (documents
come from trusted sources; orz-markdown does not filter them). Show its output
only in a sandboxed frame (`<iframe sandbox srcdoc=…>`, without
`allow-same-origin`), never with `innerHTML` in your page.

`assemble` writes the same bytes as the Node library (`orz-paged`), so an app
can publish, preview or download without a server. Store the text; regenerate
the HTML.

## Assembled files in an iframe

To show **assembled files** (untrusted or third-party `.paged.html`) rather than
the component, embed them in a sandboxed iframe and speak the host protocols
(`orz-host-save@1`, `orz-host-ai@1`, `orz-host-include@1`; orz-markdown
`spec/host-protocols.md`, host side `embedCarrierFrame` in
`orz-markdown/carrier/shell`). The file then saves to you, takes AI operations
and include resolution from you, and shows no update indicator.
