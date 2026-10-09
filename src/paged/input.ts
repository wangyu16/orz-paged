/**
 * What the paged runtime (src/paged/runtime.ts) lays out: a rendered paged
 * document as data — the body HTML (`renderDocument`'s `<main class="orz-doc
 * markdown-body">`), the stylesheets Paged.js applies (the theme's and the
 * page CSS: `@page` size and margins, running headers and footers, page
 * numbers, element CSS, custom CSS), the stylesheet links the content needs
 * in `<head>` (webfonts), and the settings the runtime acts on (front-matter
 * renumbering, the dynamic choices).
 *
 * The editor's preview frame receives it as HTML (FC-19 §8.4: the shell
 * posts its renderer's output, and applies `hooks.resolveAsset` to it): the
 * body HTML followed by one `<script type="application/json"
 * data-orz-paged-input>` holding the rest ({@link encodePreviewHtml}). The
 * read view passes it to the runtime directly.
 *
 * Isomorphic, pure: no DOM, no Node built-ins.
 */

/** One stylesheet Paged.js applies, as inline CSS (`{ name: css }` for its polisher). */
export interface PagedSheet {
  name: string;
  css: string;
}

export interface PagedInput {
  /** The document body: `<main class="orz-doc markdown-body">…</main>`. */
  bodyHtml: string;
  /** The stylesheets of the pages, in order (theme, then page CSS last so it wins). */
  sheets: PagedSheet[];
  /** Stylesheet URLs the content needs in `<head>` (the theme's and the header's webfonts). */
  links: string[];
  /** Renumber the body after `placement: page` front matter (`front_matter: clean`). */
  frontMatterClean: boolean;
  /** The header's `dynamic_choices` (normalized keys). */
  dynamicChoices: Record<string, string>;
}

/** The marker attribute of the input's JSON script in a preview payload. */
export const INPUT_ATTRIBUTE = 'data-orz-paged-input';

/** The preview payload: the body HTML, then the rest as JSON (`<` escaped, so it cannot close the script). */
export function encodePreviewHtml(input: PagedInput): string {
  const { bodyHtml, ...rest } = input;
  const json = JSON.stringify(rest).replace(/</g, '\\u003c');
  return `${bodyHtml}\n<script type="application/json" ${INPUT_ATTRIBUTE}>${json}</script>`;
}
