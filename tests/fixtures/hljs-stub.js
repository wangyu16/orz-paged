/*
 * A stand-in for highlight.js 11 in the offline tests (tests/browser-env.ts
 * `routeCdn({ highlight: true })` serves it at highlight.js' pinned URL): the
 * same API orz-markdown's enhancement probes (`hljs.highlightElement`) and
 * the same DOM shape — keywords, strings, numbers and comments as token
 * `<span class="hljs-…">`s, everything else (the newlines and indentation
 * between two tokens among it) as plain text nodes — the shape Paged.js
 * mishandled on continuation pages (closed loop round 3, R.12).
 */
(function () {
  var RE = /(#[^\n]*|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(def|return|if|else|elif|for|while|in|import|from|class|function|const|let|var|true|false|None|self)\b|\b(\d+(?:\.\d+)?)\b/g;
  var KIND = ['', 'hljs-comment', 'hljs-string', 'hljs-keyword', 'hljs-number'];
  function highlightElement(el) {
    if (/\blanguage-(text|plaintext|nohighlight)\b|\bnohighlight\b/.test(el.className)) { el.classList.add('hljs'); return; } // plain text: one text node
    var text = el.textContent || '';
    var frag = document.createDocumentFragment();
    var last = 0;
    var m;
    RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var k = m[1] ? 1 : m[2] ? 2 : m[3] ? 3 : 4;
      var s = document.createElement('span');
      s.className = KIND[k];
      s.textContent = m[0];
      frag.appendChild(s);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    el.replaceChildren(frag);
    el.classList.add('hljs');
    el.setAttribute('data-highlighted', 'yes');
  }
  window.hljs = { highlightElement: highlightElement, highlightAll: function () { document.querySelectorAll('pre code').forEach(highlightElement); } };
})();
