// @ts-check
/// <reference path="../../browser/index.d.ts" />
/**
 * A minimal web app that embeds the orz-paged editor component (FC-19): two
 * editors on one page — each with the Paged.js preview in its sandboxed
 * frame —, every hook wired to in-memory app state, under the page's nonce
 * CSP. The app stores TEXT (the canonical document, FC-18); assembled files
 * are made on demand with `assemble`.
 */
(() => {
  const C = globalThis.OrzCarrier;
  if (!C) throw new Error('orz-paged-browser did not load');
  const NONCE = 'orz-demo-nonce';
  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

  /** The app's storage: text by document id (what Alembic would keep in its database). */
  const store = new Map();
  /** Uploaded assets: relative path → object URL. */
  const assets = new Map();
  /** Every hook call, for the log (and the tests). */
  const calls = [];
  const log = (/** @type {string} */ hook, /** @type {string} */ detail) => {
    calls.push({ hook, detail });
    const li = document.createElement('li');
    li.textContent = `${hook}: ${detail}`;
    $('log').prepend(li);
  };

  /** Includes the app resolves under its own policy (here: a fixed table). */
  const INCLUDES = { 'https://example.test/glossary.md': '**Buffer** — resists pH change.\n' };

  /** @param {string} id @returns {import('../../browser/index.d.ts').EditorHooks} */
  const hooksFor = (id) => ({
    async save(text) { store.set(id, text); log('save', `${id} (${text.length} chars)`); refreshLibrary(); },
    resolveAsset(path) { log('resolveAsset', path); return assets.get(path) ?? new URL(path, location.href).href; },
    resolveLink(href) { log('resolveLink', href); return href; },
    async fetchInclude(target) { log('fetchInclude', target); return Object.prototype.hasOwnProperty.call(INCLUDES, target) ? INCLUDES[target] : null; },
    async uploadAsset(file) { const path = `assets/${file.name}`; assets.set(path, URL.createObjectURL(file)); log('uploadAsset', path); return path; },
    ai: {
      operations: [{ id: 'shout', title: 'Shout the selection', selection: true }, { id: 'sign', title: 'Sign the document', selection: false }],
      async request(op, ctx) {
        log('ai', `${op}${ctx.selection ? ` [${ctx.selection.from}, ${ctx.selection.to})` : ''}`);
        if (op === 'shout' && ctx.selection) return { proposed: ctx.text.slice(ctx.selection.from, ctx.selection.to).toUpperCase() };
        return { proposed: `${ctx.text}\n— signed by the course app\n` };
      },
    },
    async mintUid() {
      const a = new Uint8Array(16); crypto.getRandomValues(a);
      const uid = `doc-${Array.from(a, (b) => (b % 36).toString(36)).join('')}`;
      log('mintUid', uid);
      return uid;
    },
  });

  const A_TEXT = [
    '{{nyml', 'kind: document', 'carrier: paged', 'title: Buffers — handout', 'author: Course app', 'uid: doc-webappexample01', 'theme: light-academic-1', 'template: note', 'page_size: A5', '}}', '',
    '# Buffers', '', 'A buffer keeps the pH nearly constant. See [week 2](week2.md) and ![a figure](figures/curve.png).', '',
    '{{md https://example.test/glossary.md}}', '', '$$pH = pK_a + \\log\\frac{[A^-]}{[HA]}$$', '',
  ].join('\n');
  const QUIZ = '{{nyml\nkind: document\ncarrier: paged\ntitle: Quiz\ntemplate: exam-section\ndynamic_choices: |\n  answer-key: hide\n}}\n\n# Quiz\n\nquick questions here\n';
  store.set('a', A_TEXT);
  store.set('b', QUIZ);

  const editors = {
    a: C.mountEditor($('editor-a'), { text: A_TEXT, hooks: hooksFor('a'), nonce: NONCE, mode: 'split' }),
    b: C.mountEditor($('editor-b'), { text: QUIZ, hooks: hooksFor('b'), nonce: NONCE, chrome: 'none', mode: 'editor' }),
  };

  // Cmd/Ctrl+P in an editor or its preview prints the document's pages, never this page: a print document of the
  // text (the paged runtime lays it out in a hidden sandboxed frame, under this page's nonce), printed by the kit's
  // printDocument when the pages are final. One print at a time.
  let printing = null;
  for (const [id, ed] of Object.entries(editors)) {
    ed.on('print', () => {
      if (printing) return;
      log('print', id);
      printing = C.renderPreview(ed.getText(), { document: true, pages: true, nonce: NONCE, fetchInclude: async (u) => INCLUDES[u] ?? null })
        .then((html) => C.printDocument(html, { nonce: NONCE }))
        .finally(() => { printing = null; });
    });
  }

  // the app's own controls for the chrome-less editor
  $('b-save').addEventListener('click', () => { void editors.b.save(); });
  $('b-undo').addEventListener('click', () => { editors.b.undo(); });
  $('b-mode').addEventListener('click', () => {
    const order = /** @type {const} */ (['editor', 'split', 'preview']);
    editors.b.setMode(order[(order.indexOf(editors.b.getMode()) + 1) % order.length]);
  });
  $('b-ai').addEventListener('click', () => { void editors.b.requestAi('shout', { selection: true }); });
  $('b-download').addEventListener('click', async () => {
    const text = editors.b.getText();
    const html = await C.assemble(text, { delivery: 'cdn' }); // a small file that loads the engine from jsDelivr
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    a.download = 'quiz.paged.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // the library: index stored texts without rendering; a read-only (not paginated) preview in a sandboxed frame
  async function refreshLibrary() {
    const ul = $('library');
    ul.replaceChildren();
    for (const [, text] of store) {
      const info = C.readDocument(text);
      const li = document.createElement('li');
      li.textContent = `${info.title} (${info.meta.uid ?? 'no uid'}, theme ${info.theme ?? 'default'})`;
      ul.append(li);
    }
    const thumb = /** @type {HTMLIFrameElement} */ ($('thumb'));
    thumb.srcdoc = await C.renderPreview(store.get('a') ?? '', { document: true, nonce: NONCE, fetchInclude: async (u) => INCLUDES[u] ?? null }); // the srcdoc frame inherits the page's policy: its <style> needs the nonce
  }
  $('version').textContent = `orz-paged-browser ${C.version}`;
  void refreshLibrary();

  /** For tests and the console. */
  Object.assign(globalThis, { demo: { editors, store, assets, calls, refreshLibrary } });
})();
