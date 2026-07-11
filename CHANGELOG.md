# Changelog

All notable changes to **orz-paged** are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

## [0.7.0] — 2026-07-11

### Added

- **`orz-host-include@1`** — a hosted paged document resolves `{{md-include https://…}}` for its preview via the host; the engine paginates the resolved text while the saved source keeps the raw directives (a rawSource stash). Standalone never resolves and never auto-fetches. See PROTOCOL.md.

## [0.6.1] — 2026-07-11

### Security

- Updated build/test tooling to fixed `esbuild ^0.28.1` and `vitest ^4.1.10`
  releases. Runtime dependencies and generated document behavior are unchanged.

### Packaging

- Ship the MIT license in both the CLI and browser npm packages.

## [0.6.0] — 2026-07-11

### Added

- Portable document metadata. A source-level `{{nyml kind: meta}}` block is
  consumed at generation time and emitted as standard `<head>` tags plus an
  `#orz-meta` JSON island. Programmatic callers can pass `metadata` to
  `buildPagedHtml`; host values win field by field. Requires
  `orz-markdown ^1.4.0`.

### Changed

- The generic `{{nyml}}` scanner is now shared from orz-markdown, giving the
  family one parser for metadata and paged document blocks.

## [0.5.0] — 2026-07-08

### Added

- **Embedded agent guide.** Every generated `.paged.html` now carries an
  invisible HTML comment (top of `<body>`) telling an AI agent how to edit it —
  what the file is, where the editable source lives (`<script id="orz-src">`), the
  block-ID rules, and how to fetch the official orz-paged agent skill
  (`https://cdn.jsdelivr.net/npm/orz-paged/orz-paged-skills/SKILL.md`). Invisible
  to readers; readable by any external AI app opening the file's source, so it can
  edit with the correct page model and a byte-identical round-trip.
