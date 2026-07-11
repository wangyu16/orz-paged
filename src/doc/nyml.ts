/**
 * The generic `{{nyml … }}` block scanner now lives in orz-markdown
 * (`orz-markdown/nyml-blocks`), so every orz-family tool shares one grammar
 * instead of copying it. This module re-exports it for orz-paged's existing
 * import sites (`render-paged.ts`) — the implementation moved, the import path
 * stayed. Hoisted 2026-07-10; see orz-markdown's doc-meta work.
 */
export { scanNymlBlocks, type NymlBlock } from 'orz-markdown';
