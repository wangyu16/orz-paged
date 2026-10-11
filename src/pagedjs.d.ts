/** Minimal ambient types for paged.js 0.4.3 (the package ships no declarations). */
declare module 'pagedjs' {
  /** A stylesheet for the polisher: a URL (fetched) or `{ name: cssText }` inline. */
  export type Stylesheet = string | Record<string, string>;
  export class Polisher {
    constructor(setup?: boolean);
    /** The `<style>` elements it inserted into `<head>` (removed by `destroy`). */
    inserted: HTMLStyleElement[];
    destroy(): void;
  }
  export class Previewer {
    constructor(options?: Record<string, unknown>);
    polisher: Polisher;
    /** Flow `content` into `renderTo`, applying `stylesheets`. */
    preview(
      content: string | DocumentFragment | HTMLElement,
      stylesheets: Stylesheet[],
      renderTo: HTMLElement,
    ): Promise<{ total: number; pages: unknown[]; performance: number }>;
  }
  export class Chunker {
    /** Loads every font face of the document not yet loaded and waits for all of them (awaited by `flow`). */
    loadFonts(): Promise<unknown>;
  }
  export class Handler {
    constructor(chunker: unknown, polisher: unknown, caller: unknown);
  }
  export function registerHandlers(...handlers: unknown[]): void;
}
