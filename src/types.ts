/**
 * orz-paged — LOCKED INTERFACE.
 *
 * Every module codes against these types and nothing else. Changing a type here
 * ripples across the document layer, the assembler, and the engine — treat edits
 * as a coordinated change. (Mirrors orz-slides' `src/types.ts` role.)
 *
 * Vocabulary follows DESIGN.md §6–§9 and docs/document-model.md (the curated
 * subset). Lengths: margins in **mm**, font size in **pt**, line-height unitless.
 */

/* ─────────────────────────── enumerations ─────────────────────────── */

/** Named page sizes; a custom CSS size string (e.g. `"210mm 297mm"`) is allowed. */
export type PageSize = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | (string & {});

/** Where the page number sits in the margin boxes. */
export type PageNumberPosition =
  | 'header-left' | 'header-center' | 'header-right'
  | 'footer-left' | 'footer-center' | 'footer-right'
  | 'none';

/** How the page number renders (counter formats). */
export type PageNumberStyle =
  | 'simple' | 'page-n' | 'page-n-of-N' | 'n-of-N'
  | 'n-slash-N' | 'dash-n-dash' | 'brackets' | 'parentheses';

/**
 * Curated document templates. `article`/`report`/`exam` come in two variants —
 * `-page` (a dedicated title/cover page) and `-section` (title-on-content) — via
 * the title element's `placement`. Legacy names (`article`/`report`/`exam`) still
 * resolve to the `-section` variant (see resolveTemplate).
 */
export type TemplateName =
  | 'article-page' | 'article-section'
  | 'report-page' | 'report-section'
  | 'exam-page' | 'exam-section'
  | 'letter' | 'cover-letter' | 'cv' | 'note';

/** Curated, light-only themes (DESIGN §8). `none` = plain. */
export type ThemeName =
  | 'none'
  | 'light-academic-1' | 'light-academic-2'
  | 'light-neat-1' | 'light-neat-2' | 'light-neat-3'
  | 'beige-decent-1' | 'beige-decent-2';

/** Curated CDN font presets (DESIGN §4, §8). */
export type FontPresetName =
  | 'system-serif' | 'source-serif-4' | 'lora' | 'crimson-pro' | 'noto-serif'
  | 'inter' | 'ibm-plex-sans' | 'roboto' | 'raleway' | 'noto-sans'
  | 'courier-prime';

/** Curated document elements (DESIGN §8). */
export type ElementKind =
  | 'article-title' | 'report-title' | 'exam-title'
  | 'abstract' | 'letterhead' | 'letter-inside-address' | 'letter-signature'
  | 'toc' | 'cv-header' | 'question-mc' | 'question-open' | 'timestamp';

/** A title/cover element renders either as its own page or inline (DESIGN §8). */
export type Placement = 'page' | 'section';

/* ─────────────────────────── document settings ─────────────────────────── */

/**
 * Raw `{{nyml kind: document}}` payload — snake_case keys, loosely typed, every
 * field optional. M1 (`settings`) parses this from the source.
 */
export type RawDocSettings = Record<string, string | number | boolean | undefined>;

/**
 * Fully-normalized document settings — every field resolved with defaults
 * applied (after merging template + user layers). M5 (`page-css`) consumes this.
 */
export interface DocSettings {
  // page
  pageSize: PageSize;
  marginTop: number;      // mm
  marginBottom: number;   // mm
  marginLeft: number;     // mm
  marginRight: number;    // mm
  pageBackground?: string;        // CSS color; light only

  // typography
  fontPreset?: FontPresetName;    // undefined → theme/base font applies
  fontFamily?: string;            // advanced override of the CSS stack
  fontHeadingPreset?: FontPresetName;
  fontMarginBoxPreset?: FontPresetName;
  fontSize: number;       // pt
  lineHeight: number;     // unitless
  decorationColor?: string;       // accent CSS color; undefined → theme/base provides

  // page numbers
  pageNumberPosition: PageNumberPosition;
  pageNumberStyle: PageNumberStyle;
  pageNumberStartPage: number;
  firstPageSkipNumber: boolean;

  // running headers / footers (static text in the margin boxes)
  headerLeft: string; headerCenter: string; headerRight: string;
  headerRule: boolean; headerRuleColor?: string; headerFontSize: number;
  footerLeft: string; footerCenter: string; footerRight: string;
  footerRule: boolean; footerRuleColor?: string; footerFontSize: number;
  firstPageHideHeader: boolean; firstPageHideFooter: boolean;
  /** Strip header/footer/number from every `placement: page` front-matter page
   *  (title / abstract / toc on their own pages) and restart the page count so
   *  the first main-content page is 1. */
  frontMatterClean: boolean;

  // layout behavior
  limitImageToPage: boolean;
  keepImageTogether: boolean;
  repeatTableHeader: boolean;
  avoidTableRowBreaks: boolean;

  // theme / template / escape hatch
  theme: ThemeName;
  template?: TemplateName;
  customCss?: string;
}

/** A partial settings layer (template defaults / user overrides) for merging. */
export type DocSettingsLayer = Partial<DocSettings>;

/* ─────────────────────────── elements ─────────────────────────── */

/** One `{{nyml kind: element}}` block: its kind + raw field map. */
export interface ElementSpec {
  kind: ElementKind;
  /** snake_case field → raw string value (multiline values preserved). */
  fields: Record<string, string>;
  /** parsed `placement:` if present (title/cover elements). */
  placement?: Placement;
}

/** Capabilities an element renderer may use (injected — no hard orz-markdown dep). */
export interface ElementCtx {
  /** Render inline Markdown (no wrapping `<p>`). */
  renderInline(md: string): string;
  /** Render block Markdown. */
  renderBlock(md: string): string;
  /** The resolved document settings (for accent color, fonts, etc.). */
  settings: DocSettings;
}

/** Output of rendering one element. */
export interface ElementResult {
  /** The element's HTML, placed into the document flow. */
  html: string;
  /** Scoped CSS for this element kind; injected **once** per kind (dedupe by kind). */
  css?: string;
  /** `page` → on its own page; `section` → inline. Defaults to `section`. */
  placement: Placement;
}

/* ─────────────────────────── fonts ─────────────────────────── */

/** A resolved font preset: a CDN stylesheet to load + the CSS family stack. */
export interface FontPreset {
  /** `<link rel="stylesheet">` href (e.g. an @fontsource / Google Fonts URL). */
  cssUrl: string;
  /** the `font-family` value to use. */
  family: string;
}

/* ─────────────────────────── assembly ─────────────────────────── */

/**
 * Result of assembling a document (A1) — everything the engine/template needs to
 * render the paginated document. Pure data; no DOM.
 */
export interface PagedAssembly {
  /** The page CSS (from M5) + element scoped CSS + theme hook + custom CSS. */
  css: string;
  /** Font stylesheet URLs to `<link>` in <head> (from M3, deduped). */
  fontCssUrls: string[];
  /** Theme name to load its stylesheet. */
  theme: ThemeName;
  /** The document body HTML (content + elements), pre-pagination. */
  bodyHtml: string;
  /** The fully-resolved settings (for the editor settings panel + runtime). */
  settings: DocSettings;
}

/* ─────────────────────────── build-time global ─────────────────────────── */

declare global {
  /** Injected by esbuild at bundle time (build/bundle.ts). */
  const __ORZPAGED_VERSION__: string;
}
