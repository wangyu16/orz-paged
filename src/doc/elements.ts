/**
 * orz-paged — built-in document elements.
 *
 * `renderElement(spec, ctx)` turns one `{{nyml kind: element}}` block into
 * semantic HTML + a small scoped stylesheet. Every element is wrapped in
 * `<section class="orz-element orz-el-<kind>">…</section>`. Markdown-typed
 * fields go through the injected `ctx.renderInline` / `ctx.renderBlock` so this
 * module never depends on orz-markdown directly.
 *
 * The `css` returned per kind is identical on every call (the assembler dedupes
 * by kind), uses `var(--accent)` for the accent color, and stays light-only.
 *
 * Spec: docs/document-model.md (Built-in Elements) — reimplemented cleanly.
 */

import type {
  ElementSpec,
  ElementCtx,
  ElementResult,
  ElementKind,
  Placement,
} from '../types.js';

/* ─────────────────────────── helpers ─────────────────────────── */

/** Escape text destined for an HTML attribute value (and general text). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Read a field, trimmed; returns '' when absent. */
function field(spec: ElementSpec, key: string): string {
  const v = spec.fields[key];
  return v == null ? '' : v.trim();
}

/** True when a field is present and non-empty after trimming. */
function has(spec: ElementSpec, key: string): boolean {
  return field(spec, key) !== '';
}

/** Read a boolean field; absent → fallback. `false`/`no`/`off`/`0` are false. */
function boolField(spec: ElementSpec, key: string, fallback: boolean): boolean {
  const v = spec.fields[key];
  if (v == null || v.trim() === '') return fallback;
  return !/^(false|no|off|0)$/i.test(v.trim());
}

/** Split a pipe-separated multi-line field into trimmed, non-empty parts. */
function pipeLines(value: string): string[] {
  return value
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** Split a multiline field into trimmed, non-empty lines. */
function textLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** ORCID iD + email icons for author entries (compact, inline, ~1em). */
const ORCID_ICON =
  '<svg class="orz-orcid-icon" viewBox="0 0 256 256" aria-hidden="true"><path fill="#A6CE39" d="M256 128c0 70.7-57.3 128-128 128S0 198.7 0 128 57.3 0 128 0s128 57.3 128 128z"/><g fill="#fff"><path d="M86.3 186.2H70.9V79.1h15.4v107.1z"/><path d="M108.9 79.1h41.6c39.6 0 57 28.3 57 53.6 0 27.5-21.5 53.6-56.8 53.6h-41.8V79.1zm15.4 93.3h24.5c34.9 0 42.9-26.5 42.9-39.7 0-21.5-13.7-39.7-43.7-39.7h-23.7v79.4z"/><path d="M88.7 56.8a10.1 10.1 0 1 1-20.2 0 10.1 10.1 0 0 1 20.2 0z"/></g></svg>';
const EMAIL_ICON =
  '<svg class="orz-email-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';

/** Parse one `authors:` line: `Name | marks | email | orcid`. Fields after the
 *  name are auto-detected (`@` → email, an ORCID id / orcid.org → orcid, else
 *  affiliation/note markers), so order is flexible and any may be omitted. */
function parseAuthor(line: string): { name: string; marks: string; email: string; orcid: string } {
  const parts = line.split('|').map((s) => s.trim());
  const out = { name: parts[0] || '', marks: '', email: '', orcid: '' };
  for (const p of parts.slice(1)) {
    if (!p) continue;
    if (p.includes('@')) out.email = p;
    else if (/orcid\.org/i.test(p) || /^\d{4}-\d{4}-\d{4}-\d{3}[\dXx]$/.test(p)) out.orcid = p;
    else out.marks = p;
  }
  return out;
}

/** ORCID iD link for an author entry. */
function orcidLink(orcid: string): string {
  const m = orcid.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])/);
  const id = m ? m[1] : orcid;
  return `<a class="orz-author-orcid" href="https://orcid.org/${escapeHtml(id)}" title="ORCID ${escapeHtml(id)}">${ORCID_ICON}</a>`;
}

/** Email link for an author entry. */
function emailLink(email: string): string {
  return `<a class="orz-author-email" href="mailto:${escapeHtml(email)}" title="${escapeHtml(email)}">${EMAIL_ICON}</a>`;
}

/** Render a `key: text` reference line (affiliations / notes) with a superscript key. */
function refLine(line: string, cls: string, ctx: ElementCtx): string {
  const m = line.match(/^([^:]+):\s*(.*)$/);
  const key = m ? m[1].trim() : '';
  const text = m ? m[2].trim() : line;
  return `<div class="${cls}">${key ? `<sup>${escapeHtml(key)}</sup> ` : ''}${ctx.renderInline(text)}</div>`;
}

/** Resolve the effective placement for a spec (`spec.placement` or fields). */
function resolvePlacement(spec: ElementSpec): Placement {
  if (spec.placement === 'page') return 'page';
  if (field(spec, 'placement').toLowerCase() === 'page') return 'page';
  return 'section';
}

/** CSS that turns a section into a dedicated page (used for `placement: page`).
 *  `page: orz-front` names the page so page-css can target it (front_matter:
 *  clean strips its chrome via `@page orz-front`). Harmless when no such rule. */
const PAGE_BREAK_CSS = `
.orz-el-PLACEHOLDER.orz-place-page {
  break-after: page;
  page: orz-front;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 80vh;
}`;

/** Build the page-break rule scoped to a kind. */
function pageBreakCss(kind: ElementKind): string {
  return PAGE_BREAK_CSS.replace(/PLACEHOLDER/g, kind);
}

/** Wrap inner HTML in the element <section> with kind + placement classes. */
function wrap(kind: ElementKind, placement: Placement, inner: string): string {
  const placeClass = placement === 'page' ? ' orz-place-page' : '';
  return `<section class="orz-element orz-el-${kind}${placeClass}">${inner}</section>`;
}

/* ─────────────────────────── title elements ─────────────────────────── */

type TitleKind = 'article-title' | 'report-title' | 'exam-title';

function renderTitle(kind: TitleKind, spec: ElementSpec, ctx: ElementCtx): ElementResult {
  const placement = resolvePlacement(spec);
  const rows: string[] = [];

  if (has(spec, 'title')) {
    rows.push(`<h1 class="orz-title">${ctx.renderInline(field(spec, 'title'))}</h1>`);
  }
  if (has(spec, 'subtitle')) {
    rows.push(`<p class="orz-subtitle">${ctx.renderInline(field(spec, 'subtitle'))}</p>`);
  }

  // Authors: rich `authors:` (multiple — each with affiliation marks / email /
  // orcid) or the simple legacy `author:` single line. `affiliations:` and
  // `notes:` are `key: text` lists keyed by the markers used in `authors:`.
  const meta: string[] = [];
  if (has(spec, 'authors')) {
    const items = textLines(field(spec, 'authors')).map(parseAuthor).map((a) => {
      let s = `<span class="orz-author-name">${ctx.renderInline(a.name)}</span>`;
      if (a.marks) s += `<sup class="orz-author-mark">${escapeHtml(a.marks)}</sup>`;
      if (a.email) s += emailLink(a.email);
      if (a.orcid) s += orcidLink(a.orcid);
      return `<span class="orz-author">${s}</span>`;
    });
    if (items.length) {
      meta.push(`<div class="orz-authors">${items.join('<span class="orz-author-sep">, </span>')}</div>`);
    }
  } else if (has(spec, 'author')) {
    meta.push(`<div class="orz-author orz-authors">${ctx.renderInline(field(spec, 'author'))}</div>`);
  }
  if (has(spec, 'affiliations')) {
    const lines = textLines(field(spec, 'affiliations')).map((l) => refLine(l, 'orz-affil', ctx));
    if (lines.length) meta.push(`<div class="orz-affiliations">${lines.join('')}</div>`);
  }
  if (has(spec, 'notes')) {
    const lines = textLines(field(spec, 'notes')).map((l) => refLine(l, 'orz-note', ctx));
    if (lines.length) meta.push(`<div class="orz-notes">${lines.join('')}</div>`);
  }
  if (kind === 'exam-title') {
    if (has(spec, 'course')) {
      meta.push(`<div class="orz-course">${ctx.renderInline(field(spec, 'course'))}</div>`);
    }
    if (has(spec, 'instructor')) {
      meta.push(`<div class="orz-instructor">${escapeHtml(field(spec, 'instructor'))}</div>`);
    }
    const examMeta: string[] = [];
    if (has(spec, 'duration')) examMeta.push(escapeHtml(field(spec, 'duration')));
    if (has(spec, 'total_points')) examMeta.push(escapeHtml(field(spec, 'total_points')));
    if (examMeta.length) {
      meta.push(`<div class="orz-exam-meta">${examMeta.join(' &middot; ')}</div>`);
    }
  }
  if (has(spec, 'date')) {
    meta.push(`<div class="orz-date">${escapeHtml(field(spec, 'date'))}</div>`);
  }
  if (has(spec, 'doi')) {
    meta.push(`<div class="orz-doi">${escapeHtml(field(spec, 'doi'))}</div>`);
  }
  if (meta.length) {
    rows.push(`<div class="orz-title-meta">${meta.join('')}</div>`);
  }

  // Exam-only: student fill-in fields (Name / Student ID / Score …) and an
  // optional instructions block, both on the title page/section — so identity
  // fields live on page 1 instead of a running header on every page.
  if (kind === 'exam-title') {
    if (has(spec, 'student_fields')) {
      // Each line is a ROW; `|` puts several fields on the same row. A trailing
      // `/ <number>` (e.g. "Score / 100") becomes a suffix after the blank.
      const fieldRows = textLines(field(spec, 'student_fields')).map((line) => {
        const fields = line
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((f) => {
            const m = f.match(/^(.*?)\s*(\/\s*\d.*)$/);
            const label = m ? m[1].trim() : f;
            const suffix = m ? m[2].trim() : '';
            return '<span class="orz-exam-field">'
              + `<span class="orz-field-label">${ctx.renderInline(label)}</span>`
              + '<span class="orz-field-blank"></span>'
              + (suffix ? `<span class="orz-field-suffix">${ctx.renderInline(suffix)}</span>` : '')
              + '</span>';
          });
        return fields.length ? `<div class="orz-exam-row">${fields.join('')}</div>` : '';
      }).filter(Boolean);
      if (fieldRows.length) rows.push(`<div class="orz-exam-fields">${fieldRows.join('')}</div>`);
    }
    if (has(spec, 'instructions')) {
      rows.push(`<div class="orz-exam-instructions">${ctx.renderBlock(field(spec, 'instructions'))}</div>`);
    }
  }

  const html = wrap(kind, placement, rows.join(''));

  let css = `
.orz-el-${kind} {
  text-align: center;
  margin: 0 0 1.5rem;
}
.orz-el-${kind} .orz-title {
  margin: 0 0 0.25em;
  font-size: 1.9em;
  line-height: 1.2;
  color: var(--accent, #000);
}
/* The title is an <h1>; neutralize any theme h1 underline — the rule under a
   title block is owned by the element wrapper, not the heading. */
.orz-doc.markdown-body .orz-el-${kind} .orz-title { border-bottom: 0; padding-bottom: 0; }
.orz-doc.markdown-body .orz-el-${kind} .orz-subtitle {
  margin: 0 0 0.75em;
  font-size: 1.2em;
  font-style: italic;
  opacity: 0.85;
  /* outspecify a theme's justified-prose rule (.orz-doc.markdown-body p) so the
     subtitle stays centered with the rest of the title block */
  text-align: center;
}
.orz-el-${kind} .orz-title-meta {
  font-size: 0.95em;
  line-height: 1.5;
}
.orz-el-${kind} .orz-title-meta > div {
  margin: 0.1em 0;
}
.orz-el-${kind} .orz-authors {
  font-weight: 600;
}
.orz-el-${kind} .orz-author { white-space: nowrap; }
.orz-el-${kind} .orz-author-mark,
.orz-el-${kind} .orz-author-sep { font-weight: 400; }
.orz-el-${kind} .orz-author-email,
.orz-el-${kind} .orz-author-orcid { margin-left: 0.22em; text-decoration: none; }
.orz-el-${kind} .orz-author-email { color: var(--accent, #555); }
.orz-el-${kind} .orz-author-email svg,
.orz-el-${kind} .orz-author-orcid svg {
  width: 0.92em; height: 0.92em; vertical-align: -0.13em;
}
.orz-el-${kind} .orz-affiliations {
  font-weight: 400; font-size: 0.82em; opacity: 0.85;
  margin-top: 0.4em; line-height: 1.5;
}
.orz-el-${kind} .orz-notes {
  font-weight: 400; font-size: 0.78em; opacity: 0.8;
  margin-top: 0.25em; line-height: 1.5;
}
.orz-el-${kind} .orz-affil sup,
.orz-el-${kind} .orz-note sup { margin-right: 0.12em; }`;

  if (kind === 'exam-title') {
    css += `
.orz-el-exam-title .orz-exam-fields {
  text-align: left;
  margin: 1.3em auto 0;
  max-width: 40em;
}
.orz-el-exam-title .orz-exam-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em 1.3em;
  margin: 0.75em 0;
}
.orz-el-exam-title .orz-exam-field {
  flex: 1 1 0;
  display: flex;
  align-items: flex-end;
  gap: 0.4em;
}
.orz-el-exam-title .orz-field-label { white-space: nowrap; font-weight: 600; }
.orz-el-exam-title .orz-field-blank {
  flex: 1;
  min-width: 2.5em;
  height: 1.45em;
  border-bottom: 1px solid var(--text-main, #333);
}
.orz-el-exam-title .orz-field-suffix { white-space: nowrap; color: var(--text-muted, #555); }
.orz-doc.markdown-body .orz-el-exam-title .orz-exam-instructions {
  text-align: left;
  margin: 1.4em auto 0;
  max-width: 40em;
  font-size: 0.94em;
}
.orz-doc.markdown-body .orz-el-exam-title .orz-exam-instructions p { text-align: left; margin: 0.35em 0; }`;
  }
  css += pageBreakCss(kind);

  return { html, css, placement };
}

/* ─────────────────────────── abstract ─────────────────────────── */

function renderAbstract(spec: ElementSpec, ctx: ElementCtx): ElementResult {
  const placement = resolvePlacement(spec);
  const parts: string[] = [];

  parts.push('<h2 class="orz-abstract-heading">Abstract</h2>');
  if (has(spec, 'text')) {
    parts.push(`<div class="orz-abstract-body">${ctx.renderBlock(field(spec, 'text'))}</div>`);
  }
  if (has(spec, 'keywords')) {
    parts.push(
      `<p class="orz-keywords"><span class="orz-keywords-label">Keywords:</span> ${ctx.renderInline(
        field(spec, 'keywords'),
      )}</p>`,
    );
  }

  const html = wrap('abstract', placement, parts.join(''));

  let css = `
.orz-el-abstract {
  margin: 0 auto 1.5rem;
  padding: 0 2em;
  font-size: 0.95em;
}
.orz-el-abstract .orz-abstract-heading {
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.9em;
  margin: 0 0 0.5em;
  color: var(--accent, #000);
}
.orz-el-abstract .orz-abstract-body p:first-child {
  margin-top: 0;
}
.orz-el-abstract .orz-keywords {
  margin: 0.75em 0 0;
}
.orz-el-abstract .orz-keywords-label {
  font-weight: 600;
}`;
  css += pageBreakCss('abstract');

  return { html, css, placement };
}

/* ─────────────────────────── letterhead ─────────────────────────── */

function renderLetterhead(spec: ElementSpec, ctx: ElementCtx): ElementResult {
  const placement = resolvePlacement(spec);
  const parts: string[] = [];

  if (has(spec, 'organization')) {
    parts.push(
      `<div class="orz-org">${ctx.renderInline(field(spec, 'organization'))}</div>`,
    );
  }
  if (has(spec, 'tagline')) {
    parts.push(`<div class="orz-tagline">${ctx.renderInline(field(spec, 'tagline'))}</div>`);
  }

  const contact: string[] = [];
  if (has(spec, 'address')) {
    for (const line of pipeLines(field(spec, 'address'))) {
      contact.push(`<span class="orz-address-line">${escapeHtml(line)}</span>`);
    }
  }
  if (has(spec, 'phone')) {
    contact.push(`<span class="orz-phone">${escapeHtml(field(spec, 'phone'))}</span>`);
  }
  if (has(spec, 'email')) {
    contact.push(`<span class="orz-email">${escapeHtml(field(spec, 'email'))}</span>`);
  }
  if (has(spec, 'website')) {
    contact.push(`<span class="orz-website">${escapeHtml(field(spec, 'website'))}</span>`);
  }
  if (contact.length) {
    parts.push(`<div class="orz-contact">${contact.join('')}</div>`);
  }

  const border = boolField(spec, 'border', true);
  const inner = `<div class="orz-letterhead-inner${border ? ' orz-bordered' : ''}">${parts.join(
    '',
  )}</div>`;
  const html = wrap('letterhead', placement, inner);

  let css = `
.orz-el-letterhead {
  margin: 0 0 1.5rem;
}
.orz-el-letterhead .orz-letterhead-inner {
  padding-bottom: 0.75em;
}
.orz-el-letterhead .orz-letterhead-inner.orz-bordered {
  border-bottom: 2px solid var(--accent, #000);
}
.orz-el-letterhead .orz-org {
  font-size: 1.4em;
  font-weight: 700;
  color: var(--accent, #000);
}
.orz-el-letterhead .orz-tagline {
  font-style: italic;
  opacity: 0.8;
  margin-top: 0.1em;
}
.orz-el-letterhead .orz-contact {
  margin-top: 0.4em;
  font-size: 0.85em;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25em 1em;
}
.orz-el-letterhead .orz-address-line {
  display: block;
  flex-basis: 100%;
}`;
  css += pageBreakCss('letterhead');

  return { html, css, placement };
}

/* ─────────────────────── letter-inside-address ─────────────────────── */

function renderInsideAddress(spec: ElementSpec, ctx: ElementCtx): ElementResult {
  const placement = resolvePlacement(spec);
  const lines: string[] = [];

  if (has(spec, 'to')) {
    lines.push(`<div class="orz-to">${ctx.renderInline(field(spec, 'to'))}</div>`);
  }
  if (has(spec, 'title')) {
    for (const line of pipeLines(field(spec, 'title'))) {
      lines.push(`<div class="orz-recipient-title">${escapeHtml(line)}</div>`);
    }
  }
  if (has(spec, 'organization')) {
    for (const line of pipeLines(field(spec, 'organization'))) {
      lines.push(`<div class="orz-recipient-org">${escapeHtml(line)}</div>`);
    }
  }
  if (has(spec, 'address')) {
    for (const line of pipeLines(field(spec, 'address'))) {
      lines.push(`<div class="orz-recipient-address">${escapeHtml(line)}</div>`);
    }
  }

  const align = field(spec, 'align').toLowerCase() === 'right' ? ' orz-align-right' : '';
  const html = wrap(
    'letter-inside-address',
    placement,
    `<address class="orz-inside-address${align}">${lines.join('')}</address>`,
  );

  let css = `
.orz-el-letter-inside-address {
  margin: 0 0 1.5rem;
}
.orz-el-letter-inside-address .orz-inside-address {
  font-style: normal;
  line-height: 1.4;
}
.orz-el-letter-inside-address .orz-inside-address.orz-align-right {
  text-align: right;
}
.orz-el-letter-inside-address .orz-to {
  font-weight: 600;
}`;
  css += pageBreakCss('letter-inside-address');

  return { html, css, placement };
}

/* ─────────────────────────── letter-signature ─────────────────────────── */

function renderSignature(spec: ElementSpec, ctx: ElementCtx): ElementResult {
  const placement = resolvePlacement(spec);
  const closing = has(spec, 'closing') ? field(spec, 'closing') : 'Sincerely';
  const space = has(spec, 'signature_space') ? field(spec, 'signature_space') : '1in';

  const parts: string[] = [];
  parts.push(`<div class="orz-closing">${ctx.renderInline(closing)},</div>`);
  parts.push(
    `<div class="orz-sig-space" style="height:${escapeHtml(space)}" aria-hidden="true"></div>`,
  );
  if (has(spec, 'from')) {
    parts.push(`<div class="orz-from">${ctx.renderInline(field(spec, 'from'))}</div>`);
  }
  if (has(spec, 'title')) {
    for (const line of pipeLines(field(spec, 'title'))) {
      parts.push(`<div class="orz-signer-title">${ctx.renderInline(line)}</div>`);
    }
  }
  if (has(spec, 'organization')) {
    for (const line of pipeLines(field(spec, 'organization'))) {
      parts.push(`<div class="orz-signer-org">${ctx.renderInline(line)}</div>`);
    }
  }

  const html = wrap(
    'letter-signature',
    placement,
    `<div class="orz-signature-block">${parts.join('')}</div>`,
  );

  let css = `
.orz-el-letter-signature {
  margin: 2rem 0 0;
}
.orz-el-letter-signature .orz-signature-block {
  margin-left: 40%;
  line-height: 1.4;
}
.orz-el-letter-signature .orz-sig-space {
  min-height: 0.75in;
}
.orz-el-letter-signature .orz-from {
  font-weight: 600;
}`;
  css += pageBreakCss('letter-signature');

  return { html, css, placement };
}

/* ─────────────────────────── toc ─────────────────────────── */

function renderToc(spec: ElementSpec): ElementResult {
  const placement = resolvePlacement(spec);
  const title = has(spec, 'title') ? field(spec, 'title') : 'Table of Contents';
  let maxLevel = parseInt(field(spec, 'max_level'), 10);
  if (!Number.isFinite(maxLevel) || maxLevel < 1 || maxLevel > 6) maxLevel = 3;

  const inner =
    `<h2 class="orz-toc-heading">${escapeHtml(title)}</h2>` +
    `<nav class="orz-toc" data-max-level="${maxLevel}"></nav>`;
  const html = wrap('toc', placement, inner);

  let css = `
.orz-el-toc {
  margin: 0 0 1.5rem;
}
.orz-el-toc .orz-toc-heading {
  color: var(--accent, #000);
  margin: 0 0 0.75em;
}
.orz-el-toc .orz-toc {
  display: block;
}`;
  css += pageBreakCss('toc');

  return { html, css, placement };
}

/* ─────────────────────────── cv-header ─────────────────────────── */

function renderCvHeader(spec: ElementSpec, ctx: ElementCtx): ElementResult {
  const placement = resolvePlacement(spec);

  const nameBlock: string[] = [];
  if (has(spec, 'full_name')) {
    nameBlock.push(
      `<h1 class="orz-cv-name">${ctx.renderInline(field(spec, 'full_name'))}</h1>`,
    );
  }
  if (has(spec, 'title')) {
    nameBlock.push(
      `<div class="orz-cv-title">${ctx.renderInline(field(spec, 'title'))}</div>`,
    );
  }

  let photo = '';
  if (has(spec, 'photo')) {
    photo = `<div class="orz-cv-photo">${ctx.renderInline(field(spec, 'photo'))}</div>`;
  }

  let contacts = '';
  if (has(spec, 'contacts')) {
    const items = pipeLines(field(spec, 'contacts'))
      .map((c) => `<span class="orz-cv-contact">${ctx.renderInline(c)}</span>`)
      .join('');
    contacts = `<div class="orz-cv-contacts">${items}</div>`;
  }

  const border = boolField(spec, 'border', true);
  const top = `<div class="orz-cv-top">${`<div class="orz-cv-identity">${nameBlock.join(
    '',
  )}</div>`}${photo}</div>`;

  let summary = '';
  if (has(spec, 'summary')) {
    summary = `<div class="orz-cv-summary">${ctx.renderBlock(field(spec, 'summary'))}</div>`;
  }

  const inner = `<div class="orz-cv-header-inner${border ? ' orz-bordered' : ''}">${top}${contacts}${summary}</div>`;
  const html = wrap('cv-header', placement, inner);

  let css = `
.orz-el-cv-header {
  margin: 0 0 1.5rem;
}
.orz-el-cv-header .orz-cv-header-inner.orz-bordered {
  border-bottom: 2px solid var(--accent, #000);
  padding-bottom: 0.75em;
}
.orz-el-cv-header .orz-cv-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1em;
}
.orz-el-cv-header .orz-cv-name {
  margin: 0;
  font-size: 1.8em;
  color: var(--accent, #000);
}
/* The name is an <h1>; neutralize any theme h1 underline — the CV header's rule
   is owned by .orz-cv-header-inner.orz-bordered, not the name. */
.orz-doc.markdown-body .orz-el-cv-header .orz-cv-name { border-bottom: 0; padding-bottom: 0; }
.orz-el-cv-header .orz-cv-title {
  font-size: 1.1em;
  opacity: 0.85;
  margin-top: 0.15em;
}
.orz-el-cv-header .orz-cv-photo {
  flex: 0 0 auto;
}
.orz-el-cv-header .orz-cv-photo img {
  width: 90px;
  height: 90px;
  object-fit: cover;
  border-radius: 50%;
}
.orz-el-cv-header .orz-cv-contacts {
  margin-top: 0.5em;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25em 1.25em;
  font-size: 0.9em;
}
.orz-el-cv-header .orz-cv-summary {
  margin-top: 0.5em;
  font-size: 0.95em;
}`;
  css += pageBreakCss('cv-header');

  return { html, css, placement };
}

/* ─────────────────────────── question-mc ─────────────────────────── */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function questionHeader(spec: ElementSpec): string {
  const n = field(spec, 'n');
  const pts = field(spec, 'pts');
  const parts: string[] = [];
  parts.push(
    `<span class="orz-q-num">${escapeHtml(n || '')}${n ? '.' : ''}</span>`,
  );
  if (pts) {
    parts.push(`<span class="orz-q-pts">(${escapeHtml(pts)})</span>`);
  }
  return `<div class="orz-q-header">${parts.join(' ')}</div>`;
}

function renderQuestionMc(spec: ElementSpec, ctx: ElementCtx): ElementResult {
  const placement = resolvePlacement(spec);
  const answer = field(spec, 'answer').toUpperCase();

  const header = questionHeader(spec);
  const body = has(spec, 'body')
    ? `<div class="orz-q-body">${ctx.renderBlock(field(spec, 'body'))}</div>`
    : '';

  const rawOptions = textLines(field(spec, 'options'));
  let longest = 0;
  const optionsHtml = rawOptions
    .map((raw, i) => {
      // Honor an explicit label like "B. text"; otherwise auto-letter.
      const m = raw.match(/^([A-Za-z])[.)]\s+(.*)$/);
      const label = (m ? m[1] : LETTERS[i] || '?').toUpperCase();
      const text = m ? m[2] : raw;
      longest = Math.max(longest, text.length);
      const isAnswer = answer !== '' && label === answer;
      const answerAttr = isAnswer ? ' data-answer="true"' : '';
      return (
        `<li class="orz-option"${answerAttr}>` +
        `<span class="orz-option-label">${escapeHtml(label)}.</span> ` +
        `<span class="orz-option-text">${ctx.renderInline(text)}</span>` +
        `</li>`
      );
    })
    .join('');

  // Collapse to a single column when any option is long.
  const singleCol = longest > 40;
  const gridClass = singleCol ? ' orz-single-col' : '';
  const options = `<ol class="orz-options${gridClass}">${optionsHtml}</ol>`;

  const html = wrap('question-mc', placement, header + body + options);

  let css = `
.orz-el-question-mc {
  margin: 0 0 1em;
  break-inside: avoid;
}
.orz-el-question-mc .orz-q-header {
  font-weight: 600;
}
.orz-el-question-mc .orz-q-pts {
  font-weight: 400;
  opacity: 0.7;
  font-size: 0.9em;
}
.orz-el-question-mc .orz-q-body {
  margin: 0.25em 0 0.5em;
}
.orz-el-question-mc .orz-q-body > p:first-child {
  margin-top: 0;
}
.orz-el-question-mc .orz-options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25em 1.5em;
}
.orz-el-question-mc .orz-options.orz-single-col {
  grid-template-columns: 1fr;
}
.orz-el-question-mc .orz-option-label {
  font-weight: 600;
}
.orz-el-question-mc .orz-option[data-answer] {
  /* visually neutral by default; an answer-key toggle styles it elsewhere */
}`;
  css += pageBreakCss('question-mc');

  return { html, css, placement };
}

/* ─────────────────────────── question-open ─────────────────────────── */

function renderQuestionOpen(spec: ElementSpec, ctx: ElementCtx): ElementResult {
  const placement = resolvePlacement(spec);
  const space = has(spec, 'space') ? field(spec, 'space') : '3cm';

  const header = questionHeader(spec);
  const body = has(spec, 'body')
    ? `<div class="orz-q-body">${ctx.renderBlock(field(spec, 'body'))}</div>`
    : '';
  const writing = `<div class="orz-q-space" style="height:${escapeHtml(
    space,
  )}" aria-hidden="true"></div>`;

  const html = wrap('question-open', placement, header + body + writing);

  let css = `
.orz-el-question-open {
  margin: 0 0 1em;
  break-inside: avoid;
}
.orz-el-question-open .orz-q-header {
  font-weight: 600;
}
.orz-el-question-open .orz-q-pts {
  font-weight: 400;
  opacity: 0.7;
  font-size: 0.9em;
}
.orz-el-question-open .orz-q-body {
  margin: 0.25em 0 0.5em;
}
.orz-el-question-open .orz-q-body > p:first-child {
  margin-top: 0;
}
.orz-el-question-open .orz-q-space {
  min-height: 1cm;
  border-bottom: 1px solid #ccc;
}`;
  css += pageBreakCss('question-open');

  return { html, css, placement };
}

/* ─────────────────────────── timestamp ─────────────────────────── */

function renderTimestamp(spec: ElementSpec): ElementResult {
  const placement = resolvePlacement(spec);
  const label = has(spec, 'label') ? field(spec, 'label') : 'Last updated';
  let date = field(spec, 'date');
  if (date === '' || date.toLowerCase() === 'auto') {
    date = new Date().toISOString().slice(0, 10);
  }

  const html = wrap(
    'timestamp',
    placement,
    `<p class="orz-timestamp-line"><span class="orz-timestamp-label">${escapeHtml(
      label,
    )}:</span> <time class="orz-timestamp-date">${escapeHtml(date)}</time></p>`,
  );

  let css = `
.orz-el-timestamp {
  margin: 0.5rem 0;
}
.orz-el-timestamp .orz-timestamp-line {
  text-align: right;
  font-size: 0.85em;
  opacity: 0.75;
  margin: 0;
}
.orz-el-timestamp .orz-timestamp-label {
  font-weight: 600;
}`;
  css += pageBreakCss('timestamp');

  return { html, css, placement };
}

/* ─────────────────────────── dispatcher ─────────────────────────── */

export function renderElement(spec: ElementSpec, ctx: ElementCtx): ElementResult {
  switch (spec.kind) {
    case 'article-title':
    case 'report-title':
    case 'exam-title':
      return renderTitle(spec.kind, spec, ctx);
    case 'abstract':
      return renderAbstract(spec, ctx);
    case 'letterhead':
      return renderLetterhead(spec, ctx);
    case 'letter-inside-address':
      return renderInsideAddress(spec, ctx);
    case 'letter-signature':
      return renderSignature(spec, ctx);
    case 'toc':
      return renderToc(spec);
    case 'cv-header':
      return renderCvHeader(spec, ctx);
    case 'question-mc':
      return renderQuestionMc(spec, ctx);
    case 'question-open':
      return renderQuestionOpen(spec, ctx);
    case 'timestamp':
      return renderTimestamp(spec);
    default:
      return { html: '', css: '', placement: 'section' };
  }
}
