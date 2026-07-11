
---

# `orz-host-include` — host-provided web transclusion

**Version 1** (`orz-host-include@1`). Companion to `orz-host-save`. Lets a
trusted host resolve URL includes (`{{md-include https://…}}`) for the PREVIEW
pagination; the saved source keeps the directive, and a standalone file never
resolves and never auto-fetches.

| Message | Direction | Payload |
| --- | --- | --- |
| `orz-host-include-hello` | host → file | `{ protocol, version: 1 }` |
| `orz-host-include-ready` | file → host | `{ protocol, version, kind: "paged" }` |
| `orz-host-include-request` | file → host | `{ requestId, url }` |
| `orz-host-include-result` | host → file | `{ requestId, ok, markdown?, error? }` |

The engine paginates `#orz-src`; the runtime writes RESOLVED text there for the
view while `currentSource()`/save keep the raw directives (a `rawSource` stash).
