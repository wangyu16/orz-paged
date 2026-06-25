/** Minimal ambient types for paged.js (the package ships no declarations). */
declare module 'pagedjs' {
  /** A stylesheet for the polisher: a URL (fetched) or `{ name: cssText }` inline. */
  export type Stylesheet = string | Record<string, string>;
  export class Previewer {
    constructor();
    /** Flow `content` into `renderTo`, applying `stylesheets`. */
    preview(
      content: string | HTMLElement,
      stylesheets: Stylesheet[],
      renderTo: HTMLElement,
    ): Promise<{ total: number; pages: unknown[] }>;
  }
  export class Handler {}
  export function registerHandlers(...handlers: unknown[]): void;
}
