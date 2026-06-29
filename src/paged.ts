/**
 * Thin wrapper around paged.js (M7). Keeps the rest of the engine ignorant of
 * paged.js internals: it paginates a content string into a target element using
 * a set of stylesheets, and triggers a browser print for PDF export.
 *
 * paged.js' `Polisher.add(...stylesheets)` accepts either a URL string (fetched)
 * or an object `{ name: cssText }` for INLINE CSS — see node_modules/pagedjs.
 */
import { Previewer } from 'pagedjs';

/** A stylesheet for paged.js: a URL (fetched) or inline CSS as `{ name: cssText }`. */
export type PagedStylesheet = string | Record<string, string>;

/**
 * Flow `content` (body HTML) into `target` as `.pagedjs_page` boxes, applying
 * `stylesheets` (the `@page` rules + content/theme CSS). Clears `target` first.
 */
export async function paginate(
  content: string,
  stylesheets: PagedStylesheet[],
  target: HTMLElement,
): Promise<void> {
  target.innerHTML = '';
  // paged.js' Polisher appends a compiled <style data-pagedjs-inserted-styles>
  // to <head> on every preview() and never removes the prior one. Without this
  // cleanup, re-rendering (e.g. a theme switch) stacks each theme's :root tokens
  // and construct rules on top of the last, so old decoration lingers and the
  // result stops matching the selected theme. Drop the stale ones first.
  document
    .querySelectorAll('style[data-pagedjs-inserted-styles]')
    .forEach((el) => el.remove());
  const previewer = new Previewer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await previewer.preview(content, stylesheets as any, target);
}

/** Export to PDF via the browser's own print engine (no Puppeteer). */
export function printDocument(): void {
  window.print();
}
