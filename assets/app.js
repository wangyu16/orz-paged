/* orz-paged in-file editor (A4). Plain browser JS, inlined into every
 * .paged.html. The rendered pages are the live preview: editing re-assembles +
 * re-paginates them (debounced). Save is self-reproducing — it serializes the
 * whole document with the edited source baked back into #orz-src, stripping
 * runtime-injected nodes ([data-orz-runtime]) and the rendered pages so the saved
 * file re-renders cleanly on next open. Ported in spirit from orz-mdhtml/slides.
 */
(function () {
  'use strict';
  var CM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16';
  var cm = null;
  var rerenderTimer = null;

  function $(id) { return document.getElementById(id); }
  function api() { return window.orzpaged; }
  function srcEl() { return $('orz-src'); }
  function currentSource() { return cm ? cm.getValue() : (srcEl() ? srcEl().textContent.replace(/^\n/, '').replace(/\n\s*$/, '') : ''); }

  function toast(msg) {
    var t = $('orz-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  /* ---- load CodeMirror on demand ---- */
  function loadCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
    l.setAttribute('data-orz-runtime', '1'); document.head.appendChild(l);
  }
  function loadJs(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-cm="' + src + '"]')) return resolve();
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.setAttribute('data-cm', src); s.setAttribute('data-orz-runtime', '1');
      s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
  function ensureCodeMirror() {
    if (window.CodeMirror) return Promise.resolve();
    loadCss(CM_BASE + '/codemirror.min.css');
    return loadJs(CM_BASE + '/codemirror.min.js')
      .then(function () { return loadJs(CM_BASE + '/mode/markdown/markdown.min.js'); });
  }

  function pagesEl() { return $('orz-pages'); }
  function isEdit() { return document.documentElement.getAttribute('data-mode') === 'edit'; }

  /* ---- preview zoom-to-fit (side-by-side pane is narrower than an A4 page) ---- */
  function fitPreview() {
    var pages = pagesEl(); if (!pages) return;
    var wrap = pages.querySelector('.pagedjs_pages'); if (!wrap) return;
    if (!isEdit()) { wrap.style.zoom = ''; return; }
    wrap.style.zoom = '';                       // measure natural page width
    var page = pages.querySelector('.pagedjs_page');
    var pageW = page ? page.getBoundingClientRect().width : 0;
    if (!pageW) return;
    wrap.style.zoom = Math.min(1, (pages.clientWidth - 28) / pageW);
  }
  window.__orzPagedAfterRender = fitPreview;     // engine calls this after every render

  /* ---- draggable divider (relative width) ---- */
  function wireDivider() {
    var d = $('orz-divider'); if (!d || d.__wired) return; d.__wired = true;
    var dragging = false;
    d.addEventListener('mousedown', function (e) {
      dragging = true; d.classList.add('dragging'); e.preventDefault();
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var pct = Math.max(20, Math.min(78, (e.clientX / window.innerWidth) * 100));
      document.documentElement.style.setProperty('--orz-split', pct + '%');
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false; d.classList.remove('dragging'); document.body.style.userSelect = '';
      if (cm) cm.refresh(); fitPreview();
    });
  }

  /* ---- proportional editor <-> preview scroll sync (toggleable) ---- */
  var syncLock = false;
  var syncEnabled = true;
  try { syncEnabled = localStorage.getItem('orz-paged-sync') !== '0'; } catch (e) {}
  function setSync(on) {
    syncEnabled = !!on;
    try { localStorage.setItem('orz-paged-sync', syncEnabled ? '1' : '0'); } catch (e) {}
    var b = $('orz-sync'); if (b) b.setAttribute('aria-pressed', syncEnabled ? 'true' : 'false');
  }
  function wireSync() {
    if (!cm || cm.__sync) return; cm.__sync = true;
    cm.on('scroll', function () {
      if (!syncEnabled || syncLock || !isEdit()) return;
      var info = cm.getScrollInfo(); var max = info.height - info.clientHeight;
      if (max <= 0) return;
      var pages = pagesEl(); var pmax = pages.scrollHeight - pages.clientHeight;
      syncLock = true; pages.scrollTop = (info.top / max) * pmax;
      setTimeout(function () { syncLock = false; }, 24);
    });
    pagesEl().addEventListener('scroll', function () {
      if (!syncEnabled || syncLock || !isEdit()) return;
      var pages = pagesEl(); var pmax = pages.scrollHeight - pages.clientHeight;
      if (pmax <= 0) return;
      var info = cm.getScrollInfo(); var max = info.height - info.clientHeight;
      syncLock = true; cm.scrollTo(null, (pages.scrollTop / pmax) * max);
      setTimeout(function () { syncLock = false; }, 24);
    });
  }

  /* ---- edit mode ---- */
  function enterEdit() {
    document.documentElement.setAttribute('data-mode', 'edit');
    checkVersion(); // edit view only — broad viewers never see the update banner
    wireDivider();
    ensureCodeMirror().then(function () {
      if (!cm) {
        var ta = $('orz-ta');
        ta.value = currentSource();
        cm = window.CodeMirror.fromTextArea(ta, {
          mode: 'markdown', lineNumbers: true, lineWrapping: true, theme: 'default',
        });
        cm.on('change', scheduleRerender);
      }
      wireSync();
      setTimeout(function () { if (cm) { cm.refresh(); cm.focus(); } fitPreview(); }, 30);
    }).catch(function () { toast('Could not load the editor (offline?)'); });
  }
  function exitEdit() {
    document.documentElement.removeAttribute('data-mode');
    fitPreview(); // reset zoom for full-window view
  }

  function scheduleRerender() {
    if (rerenderTimer) clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(function () {
      syncSource();
      if (api() && api().refresh) api().refresh();
    }, 500);
  }

  /** Keep #orz-src in sync with the editor (so refresh()/setTheme()/save use current text). */
  function syncSource() {
    var el = srcEl(); if (!el) return;
    el.textContent = '\n' + currentSource() + '\n';
  }

  /* ---- self-reproducing save ---- */
  function serialize() {
    syncSource();
    var clone = document.documentElement.cloneNode(true);
    clone.removeAttribute('data-mode');
    // strip runtime-injected nodes (fonts, libs, katex, CodeMirror assets)
    var rt = clone.querySelectorAll('[data-orz-runtime]');
    for (var i = 0; i < rt.length; i++) rt[i].parentNode.removeChild(rt[i]);
    // clear the rendered pages (the engine re-renders on load)
    var pages = clone.querySelector('#orz-pages'); if (pages) pages.innerHTML = '';
    // never bake in the (edit-only) update banner so a viewer can't see it
    var ub = clone.querySelector('#orz-update'); if (ub) { ub.classList.remove('show'); ub.removeAttribute('data-latest'); }
    // reset the editor host to a bare textarea (drop CodeMirror DOM)
    var host = clone.querySelector('#orz-editor-host');
    if (host) host.innerHTML = '<textarea id="orz-ta" spellcheck="false"></textarea>';
    // guard against a closing script tag inside the source breaking the file
    var src = clone.querySelector('#orz-src');
    if (src) src.textContent = src.textContent.replace(/<\/(script)/gi, '<\\/$1');
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  function suggestedName() {
    var t = (document.title || 'document').replace(/[^\w.-]+/g, '-');
    return t.replace(/\.paged$/, '') + '.paged.html';
  }

  /** Write `html` to disk; resolves true if saved in place (FS-Access), false if downloaded. */
  function persist(html) {
    if (window.showSaveFilePicker) {
      return window.showSaveFilePicker({
        suggestedName: suggestedName(),
        types: [{ description: 'paged HTML', accept: { 'text/html': ['.paged.html', '.html'] } }],
      }).then(function (handle) {
        return handle.createWritable().then(function (w) {
          return w.write(html).then(function () { return w.close(); });
        });
      }).then(function () { return true; });
    }
    downloadFile(html);
    return Promise.resolve(false);
  }
  function save() {
    persist(serialize()).then(function (inPlace) { if (inPlace) toast('Saved'); })
      .catch(function (e) { if (e && e.name !== 'AbortError') downloadFile(serialize()); });
  }
  function downloadFile(html) {
    var blob = new Blob([html], { type: 'text/html' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = suggestedName();
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Downloaded a copy');
  }

  /* ---- framework self-update (checked only in edit view) ---- */
  // SECURITY: the update source is HARDCODED here, never read from the file's
  // config — so a tampered/forged file cannot redirect "Update" to fetch
  // attacker-controlled code. The host is fixed to jsDelivr over HTTPS, and the
  // exact URLs are shown to the user for confirmation before anything is fetched.
  // (This protects genuine files; a wholly-malicious file controls this code too —
  // see the security note in the README. Clicking Update trusts npm + jsDelivr.)
  var UPD = {
    host: 'https://cdn.jsdelivr.net/npm/',
    manifest: 'https://data.jsdelivr.com/v1/packages/npm/orz-paged-browser/resolved',
    enginePkg: 'orz-paged-browser',
    engineFile: 'orz-paged.browser.js',
    appPkg: 'orz-paged'
  };
  function CFG() { return window.__ORZ_PAGED__ || {}; }
  function isNewer(a, b) {
    var pa = String(a).split('.'), pb = String(b).split('.');
    for (var i = 0; i < 3; i++) { var x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0; if (x > y) return true; if (x < y) return false; }
    return false;
  }
  var versionChecked = false;
  function checkVersion() {
    if (versionChecked) return; versionChecked = true;
    var c = CFG(); if (!c.version) return;
    fetch(UPD.manifest).then(function (r) { return r.json(); }).then(function (j) {
      var latest = j && j.version;
      if (latest && isNewer(latest, c.version)) showUpdate(latest);
    }).catch(function () {});
  }
  function showUpdate(latest) {
    var bar = $('orz-update'); if (!bar) return;
    bar.querySelector('.upd-text').textContent =
      'Framework ' + latest + ' available (this file uses ' + CFG().version + ').';
    bar.setAttribute('data-latest', latest);
    bar.classList.add('show');
  }
  /** One-click update: re-fetch the engine bundle + app.js from the lockstep CDN
   *  at the latest version, re-inline them, bump the version, save, and reload. */
  function applyUpdate() {
    var bar = $('orz-update'); var latest = bar && bar.getAttribute('data-latest'); if (!latest) return;
    var engineUrl = UPD.host + UPD.enginePkg + '@' + latest + '/' + UPD.engineFile;
    var appUrl = UPD.host + UPD.appPkg + '@' + latest + '/assets/app.js';
    if (!window.confirm('Update the framework to ' + latest + '?\n\nThis downloads and runs code from:\n  ' + engineUrl + '\n  ' + appUrl + '\n\nOnly proceed if you trust this document and its publisher.')) return;
    toast('Downloading framework ' + latest + '…');
    Promise.all([
      fetch(engineUrl).then(function (r) { if (!r.ok) throw new Error('engine'); return r.text(); }),
      fetch(appUrl).then(function (r) { if (!r.ok) throw new Error('app'); return r.text(); }),
    ]).then(function (res) {
      var es = document.querySelector('script[data-orz-asset="engine"]');
      if (es) { if (es.getAttribute('src')) es.setAttribute('src', engineUrl); else es.textContent = res[0]; }
      var as = document.querySelector('script[data-orz-asset="app"]');
      if (as) as.textContent = res[1];
      var cs = document.querySelector('script[data-orz-asset="config"]');
      if (cs) { c.version = latest; cs.textContent = 'window.__ORZ_PAGED__ = ' + JSON.stringify(c) + ';'; }
      bar.classList.remove('show');
      return persist(serialize());
    }).then(function (inPlace) {
      if (inPlace === undefined) return;
      if (inPlace) { toast('Updated to ' + latest + ' — reloading…'); setTimeout(function () { location.reload(); }, 700); }
      else { toast('Updated copy downloaded — reopen it to use the new framework.'); }
    }).catch(function () { toast('Update failed — check your connection.'); });
  }

  /* ---- wire up ---- */
  function init() {
    var fab = $('orz-edit-fab'); if (fab) fab.addEventListener('click', enterEdit);
    var done = $('orz-done'); if (done) done.addEventListener('click', exitEdit);
    var exp = $('orz-export'); if (exp) exp.addEventListener('click', function () { if (api()) api().exportPdf(); });
    var sav = $('orz-save'); if (sav) sav.addEventListener('click', save);
    var theme = $('orz-theme');
    if (theme) theme.addEventListener('change', function () { if (api() && api().setTheme) api().setTheme(theme.value); });
    var sync = $('orz-sync');
    if (sync) { setSync(syncEnabled); sync.addEventListener('click', function () { setSync(!syncEnabled); }); }
    var updApply = $('orz-upd-apply'); if (updApply) updApply.addEventListener('click', applyUpdate);
    var updDismiss = $('orz-upd-dismiss');
    if (updDismiss) updDismiss.addEventListener('click', function () { var u = $('orz-update'); if (u) u.classList.remove('show'); });
    var rz; window.addEventListener('resize', function () {
      if (!isEdit()) return; clearTimeout(rz);
      rz = setTimeout(function () { if (cm) cm.refresh(); fitPreview(); }, 120);
    });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
