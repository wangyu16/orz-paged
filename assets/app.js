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
  var dirty = false; // edit-state, surfaced to an embedding host (orz-host-dirty)

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
  window.__orzPagedAfterRender = function () { fitPreview(); buildDynControls(); }; // engine calls this after every render

  /* ---- dynamic switch (live) — a control per key the document actually uses ---- */
  function humanizeKey(k) { return String(k).replace(/_/g, ' '); }
  function normKey(k) { return String(k).trim().toLowerCase().replace(/-/g, '_'); }

  function buildDynControls() {
    var host = $('orz-dyn'); if (!host) return;
    if (!api() || !api().getDynamicState) { host.innerHTML = ''; host.removeAttribute('data-keys'); return; }
    var st = api().getDynamicState();
    var opts = st.options || {}, choices = st.choices || {};
    // Only keys the CURRENT document actually uses (data-show-when / -hide-when),
    // so the control disappears when you switch to a template that has none.
    var keys = Object.keys(opts).sort();
    if (!keys.length) { host.innerHTML = ''; host.removeAttribute('data-keys'); return; }
    var sig = keys.join(',');
    if (host.getAttribute('data-keys') === sig) {            // same keys → just sync values
      keys.forEach(function (k) {
        var s = host.querySelector('select[data-key="' + k + '"]');
        if (s) s.value = choices[k] || '';
      });
      return;
    }
    host.setAttribute('data-keys', sig);
    host.innerHTML = '';
    keys.forEach(function (k) {
      var vals = (opts[k] || []).slice();
      var cur = choices[k] || '';
      if (cur && vals.indexOf(cur) < 0) vals.unshift(cur);   // keep the current value selectable
      var ctl = document.createElement('span'); ctl.className = 'orz-dyn-ctl';
      var lab = document.createElement('label'); lab.textContent = humanizeKey(k); lab.htmlFor = 'orz-dyn-' + k;
      var sel = document.createElement('select'); sel.id = 'orz-dyn-' + k; sel.setAttribute('data-key', k); sel.title = humanizeKey(k);
      vals.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
      sel.value = cur;
      // Write the choice back into the source's `dynamic_choices` block so the
      // dropdown and the nyml stay in sync (and editing the nyml drives the dropdown).
      sel.addEventListener('change', function () { applyDynChoiceToSource(k, sel.value); });
      ctl.appendChild(lab); ctl.appendChild(sel); host.appendChild(ctl);
    });
  }

  /** Set `key: value` inside the document block's `dynamic_choices:` map, matching
   *  the key by normalized form (so `answer-key` and `answer_key` are the same). */
  function setSourceDynamicChoice(src, key, value) {
    key = normKey(key);
    var lines = src.split('\n');
    var dcIdx = -1, dcIndent = 0;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(\s*)dynamic_choices\s*:/);
      if (m) { dcIdx = i; dcIndent = m[1].length; break; }
    }
    if (dcIdx < 0) return null;                       // no block — nothing to sync
    for (var j = dcIdx + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      var lm = lines[j].match(/^(\s*)([A-Za-z][\w-]*)\s*:\s*(.*)$/);
      if (!lm || lm[1].length <= dcIndent) break;     // dedented / not a key → end of block
      if (normKey(lm[2]) === key) { lines[j] = lm[1] + lm[2] + ': ' + value; return lines.join('\n'); }
    }
    var indent = ''; for (var s = 0; s < dcIndent + 2; s++) indent += ' ';
    lines.splice(dcIdx + 1, 0, indent + key.replace(/_/g, '-') + ': ' + value);
    return lines.join('\n');
  }

  function applyDynChoiceToSource(key, value) {
    var next = setSourceDynamicChoice(currentSource(), key, value);
    if (next == null) return;
    setDirty(true);
    if (cm) cm.setValue(next);
    else { var ta = $('orz-ta'); if (ta) ta.value = next; }
    syncSource();
    if (api() && api().refresh) api().refresh();
  }

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
    // reflect the theme actually in effect (document theme or a prior override)
    var th = $('orz-theme');
    if (th && api() && api().getTheme) { var cur = api().getTheme(); if (cur) th.value = cur; }
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
      setTimeout(fitPreview, 260); // re-fit once the slide-in transition settles
    }).catch(function () { toast('Could not load the editor (offline?)'); });
  }
  function exitEdit() {
    document.documentElement.removeAttribute('data-mode');
    fitPreview();                  // clear zoom immediately
    setTimeout(fitPreview, 260);   // and again after the slide-out settles
  }

  function scheduleRerender() {
    setDirty(true);
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
    clone.removeAttribute('data-orz-hosted'); // hosted-chrome flag is runtime-only, never saved bytes
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
    // A hosting platform (verified handshake) receives the save instead of the
    // file system; the host acknowledges with orz-host-saved (see PROTOCOL.md).
    if (isHosted()) { hostSave(currentSource(), serialize()); return; }
    persist(serialize()).then(function (inPlace) { if (inPlace) { setDirty(false); toast('Saved'); } })
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

  /* ---- host embedding (orz-host-save@1) ----
   * When a platform embeds this file in an iframe and announces the
   * orz-host-save protocol (spec: PROTOCOL.md in the orz-mdhtml repo), Save
   * posts the document to the host instead of touching the file system. Never
   * enabled without the host's hello; protocol messages are accepted only from
   * window.parent, and after the handshake only from the recorded host origin.
   * Message content is read as data, never evaluated. Export/PDF keeps working. */
  var HOST_PROTOCOL = 'orz-host-save';
  var HOST_VERSION = 1;
  var hostOrigin = null;    // recorded at handshake; null = unhosted
  var hostSaveTimer = null; // watchdog for a save awaiting acknowledgement

  function isHosted() { return hostOrigin !== null; }
  // An opaque embedder (sandboxed/srcdoc host) serializes as the string 'null',
  // which postMessage rejects as a targetOrigin — fall back to '*' (the payload
  // contains nothing the host doesn't already have).
  function hostTarget() { return hostOrigin && hostOrigin !== 'null' ? hostOrigin : '*'; }
  function hostPost(msg) { try { window.parent.postMessage(msg, hostTarget()); } catch (e) {} }
  function setDirty(d) {
    d = !!d;
    if (dirty === d) return;
    dirty = d;
    if (isHosted()) hostPost({ type: 'orz-host-dirty', protocol: HOST_PROTOCOL, version: HOST_VERSION, dirty: d });
  }
  function hostSave(src, html) {
    if (hostSaveTimer) return; // one save in flight at a time
    hostSaveTimer = setTimeout(function () {
      hostSaveTimer = null;
      toast('Save failed — no response from the host'); // document intact, still dirty
    }, 10000);
    hostPost({ type: 'orz-host-save', protocol: HOST_PROTOCOL, version: HOST_VERSION, source: src, html: html });
  }
  function onHostMessage(event) {
    // only the embedding parent may speak the protocol
    if (window.parent === window || event.source !== window.parent) return;
    var d = event.data;
    if (!d || typeof d !== 'object') return;
    // after the handshake, hold the parent to the origin it introduced itself with
    if (isHosted() && hostOrigin !== 'null' && event.origin !== hostOrigin) return;
    if (d.type === 'orz-host-hello' && d.protocol === HOST_PROTOCOL && typeof d.version === 'number' && d.version >= 1) {
      hostOrigin = event.origin;
      // reply with the highest version we support ≤ the host's (we speak only 1)
      hostPost({ type: 'orz-host-ready', protocol: HOST_PROTOCOL, version: HOST_VERSION, kind: 'paged' });
      // hosted chrome: the chrome CSS hides the file's orz logo (the host shows its own)
      document.documentElement.dataset.orzHosted = '1';
      if (dirty) hostPost({ type: 'orz-host-dirty', protocol: HOST_PROTOCOL, version: HOST_VERSION, dirty: true });
    } else if (d.type === 'orz-host-saved' && hostSaveTimer) {
      clearTimeout(hostSaveTimer); hostSaveTimer = null;
      if (d.ok) { setDirty(false); toast('Saved'); }
      else { toast('Save failed' + (d.error ? ' — ' + String(d.error) : '')); }
    }
  }
  // listen from script load so an early hello isn't missed
  window.addEventListener('message', onHostMessage);

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

  /* ---- template picker ---- */
  function templates() { return (window.__ORZ_PAGED__ && window.__ORZ_PAGED__.templates) || []; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var TPL_ACCENT = { Article: '#2962a4', Report: '#2f6fe0', Exam: '#9a2820', Letter: '#2e7d32', CV: '#7a3f9a', Note: '#b7791f' };
  function buildTemplateMenu() {
    var menu = $('orz-template-menu'); if (!menu || menu.getAttribute('data-built')) return;
    var list = templates(); if (!list.length) return;
    var html = '', lastGroup = '';
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.group !== lastGroup) { lastGroup = t.group; html += '<div class="tpl-group">' + esc(t.group) + '</div>'; }
      html += '<button type="button" class="tpl" data-i="' + i + '" style="--tpl-accent:' + (TPL_ACCENT[t.group] || '#2f6fe0') + '">'
        + '<span class="tpl-ic"></span>'
        + '<span class="tpl-meta"><span class="tpl-label">' + esc(t.label) + '</span>'
        + '<span class="tpl-desc">' + esc(t.description) + '</span></span></button>';
    }
    menu.innerHTML = html;
    menu.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.tpl') : null;
      if (!b) return;
      applyTemplate(list[+b.getAttribute('data-i')]);
      menu.hidden = true;
    });
    menu.setAttribute('data-built', '1');
  }
  function toggleTemplateMenu(show) {
    var menu = $('orz-template-menu'); if (!menu) return;
    if (show === undefined) show = menu.hidden;
    if (show) buildTemplateMenu();
    menu.hidden = !show;
  }
  function applyTemplate(t) {
    if (!t || !t.skeleton) return;
    var cur = currentSource().trim();
    var next = t.skeleton;
    // Preserve the old content in a comment so it's kept but inert (nyml blocks
    // inside a comment don't render). Neutralize any `-->` in it first, else the
    // first one would close the wrapper early and leak the rest back in.
    if (cur) next += '\n\n<!-- Previous content (kept below — edit or delete):\n\n'
      + cur.replace(/--+>/g, '--​>') + '\n-->\n';
    setDirty(true);
    if (cm) { cm.setValue(next); cm.focus(); }
    else { var ta = $('orz-ta'); if (ta) ta.value = next; syncSource(); if (api() && api().refresh) api().refresh(); }
    toast('Started from "' + t.label + '"');
  }

  /* ---- wire up ---- */
  function init() {
    var fab = $('orz-edit-fab'); if (fab) fab.addEventListener('click', enterEdit);
    var close = $('orz-close'); if (close) close.addEventListener('click', exitEdit);
    var exp = $('orz-export'); if (exp) exp.addEventListener('click', function () { if (api()) api().exportPdf(); });
    var sav = $('orz-save'); if (sav) sav.addEventListener('click', save);
    var tpl = $('orz-template'); if (tpl) tpl.addEventListener('click', function (e) { e.stopPropagation(); toggleTemplateMenu(); });
    document.addEventListener('click', function (e) {
      var menu = $('orz-template-menu'), btn = $('orz-template');
      if (menu && !menu.hidden && !menu.contains(e.target) && (!btn || !btn.contains(e.target))) menu.hidden = true;
    });
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
