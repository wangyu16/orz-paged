/**
 * What build/bundle.ts supplies to the browser builds at build time (never in
 * Node: only the browser entries import the modules that use these).
 */

/** The paged runtime's exact text (src/paged/runtime.ts built as a script-safe ASCII IIFE). */
declare const __ORZ_PAGED_RUNTIME__: string;

/** The print themes of assets/themes, as text. */
declare module 'orz-paged:themes' {
  /** `base.css`: the structure every theme builds on. */
  export const BASE_CSS: string;
  /** Theme id → its stylesheet (its `@import` of base.css dropped). */
  export const THEME_CSS: Readonly<Record<string, string>>;
}
