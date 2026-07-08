# Changelog

All notable changes to **orz-paged** are recorded here. Versions follow
[Semantic Versioning](https://semver.org/).

## [0.5.0] — 2026-07-08

### Added

- **Embedded agent guide.** Every generated `.paged.html` now carries an
  invisible HTML comment (top of `<body>`) telling an AI agent how to edit it —
  what the file is, where the editable source lives (`<script id="orz-src">`), the
  block-ID rules, and how to fetch the official orz-paged agent skill
  (`https://cdn.jsdelivr.net/npm/orz-paged/orz-paged-skills/SKILL.md`). Invisible
  to readers; readable by any external AI app opening the file's source, so it can
  edit with the correct page model and a byte-identical round-trip.
