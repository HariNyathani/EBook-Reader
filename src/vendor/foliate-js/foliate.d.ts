/**
 * Ambient TypeScript declarations for vendored foliate-js modules.
 *
 * foliate-js ships no types. These declarations are hand-authored against the
 * real upstream source at commit `78914aef4466eb960965702401634c2cb348e9b1`
 * (see VENDOR.md). They cover the public API surface actually consumed by
 * `src/features/reader/engine/foliate-engine.ts` and the rest of the reader
 * feature.
 *
 * Conventions:
 *   - Only export shapes that exist in the vendored source. We deliberately
 *     do not invent properties.
 *   - `?` and `| null` are used for things the source may legitimately leave
 *     undefined (e.g. before `init()` is called).
 *   - Anything not modelled here (e.g. `getProgressOf`, `getCFI`,
 *     `resolveCFI`, `resolveNavigation`, `addAnnotation`,
 *     `deleteAnnotation`, `showAnnotation`, `getSectionFractions`,
 *     `initTTS`, `startMediaOverlay`, `goLeft`, `goRight`, `goToTextStart`,
 *     `nextSection`, `prevSection`, `firstSection`, `lastSection`, etc.)
 *     exists on the real element but is not yet needed by our integration.
 *     It is added in the supplemental `FoliateView` declaration below to keep
 *     the surface discoverable for future phases.
 *
 * ISD §9.E: Hand-authored ambient types for vendored modules.
 */

// =============================================================================
// foliate-view.js  (upstream: view.js)  — the main <foliate-view> custom element
// =============================================================================

declare module '@/vendor/foliate-js/foliate-view.js' {
  /**
   * The custom element registered as `<foliate-view>`.
   *
   * This is the top-level renderer. It owns an inner renderer
   * (`<foliate-paginator>` for reflowable books or `<foliate-fxl>` for
   * pre-paginated ones) accessible via the `renderer` property.
   *
   * ## Lifecycle
   * 1. `const view = document.createElement('foliate-view')`
   * 2. `view.addEventListener('relocate', ...)` etc.
   * 3. `await view.open(file | url | book)` — also accepts `Blob`, `File`, or
   *    a string URL.
   * 4. Optionally `await view.init({ lastLocation, showTextStart })`.
   *
   * ## Events
   * - `load`           — `{ doc: Document, index: number }` when a section loads.
   * - `relocate`       — full `lastLocation` object (fraction, cfi, range, ...).
   * - `link`           — `{ a, href }` for in-book link clicks (cancelable).
   * - `external-link`  — `{ a, href_ }` for out-of-book link clicks (cancelable).
   * - `create-overlay` — `{ index }` when an overlay layer is created.
   * - `show-annotation` — `{ value, index, range }` when an annotation is shown.
   * - `draw-annotation`  — `{ draw, annotation, doc, range }` to customise drawing.
   */
  export class FoliateView extends HTMLElement {
    // ---- public state (set by open() / events) ----
    /** The book object, available after `open()` resolves. */
    book?: Book;
    /** The inner renderer — `<foliate-paginator>` or `<foliate-fxl>`. */
    renderer?: FoliatePaginator | FixedLayout;
    /** `true` once `book.rendition?.layout === "pre-paginated"`. */
    isFixedLayout: boolean;
    /** Last emitted location payload, also passed as `relocate` event detail. */
    lastLocation?: FoliateLocation | null;
    /** Bounded history stack used by `goTo`/`back`/`forward`. */
    history: FoliateHistory;
    /** Cached language info derived from book metadata. */
    language?: {
      canonical?: string;
      locale?: Intl.Locale;
      isCJK?: boolean;
      direction?: 'ltr' | 'rtl';
    };

    // ---- core lifecycle ----
    /**
     * Open a book. Accepts a `File`, `Blob`, a URL string, or a pre-built
     * `Book` object (anything implementing the "book" interface).
     * Resolves once the inner renderer is created and the first section
     * begins loading.
     */
    open(file: Book | Blob | File | string): Promise<void>;
    /**
     * Tear down the renderer. Removes the inner `<foliate-paginator>` /
     * `<foliate-fxl>`, releases section resources, and clears cached state.
     */
    close(): void;
    /**
     * Initialise the reader: optionally resume at `lastLocation` (e.g. a
     * previously-stored CFI), or jump to the start of the body matter, or
     * call `next()` to start at the first page.
     */
    init(options?: {
      lastLocation?: string | FoliateLastLocation;
      showTextStart?: boolean;
    }): Promise<void>;

    // ---- navigation ----
    /** Navigate to a target. Accepts a CFI string, an href, a fraction, or a section index. */
    goTo(target: string | number | { fraction: number }): Promise<ResolvedTarget | undefined>;
    /** Navigate to an overall reading fraction (0..1). */
    goToFraction(fraction: number): Promise<void>;
    /** Page to the previous section, if any. */
    prev(distance?: number): Promise<void>;
    /** Page to the next section, if any. */
    next(distance?: number): Promise<void>;
    /** Scroll to the start of the body matter (or first linear section). */
    goToTextStart(): Promise<void>;
    /** Page to the next section spine item. */
    nextSection(): Promise<void>;
    /** Page to the previous section spine item. */
    prevSection(): Promise<void>;
    /** Page to the first section whose `linear !== "no"`. */
    firstSection(): Promise<void>;
    /** Page to the last section whose `linear !== "no"`. */
    lastSection(): Promise<void>;
    /** Step one page in the writing direction (LTR → next, RTL → prev). */
    goLeft(): Promise<void>;
    /** Step one page against the writing direction (LTR → prev, RTL → next). */
    goRight(): Promise<void>;

    // ---- selection ----
    /** Navigate to `target` and select its range. */
    select(target: string | number): Promise<void>;
    /** Clear any active text selection. */
    deselect(): void;

    // ---- search ----
    /**
     * Search the book. Yields one of:
     *   - `{ progress: number }` per section progressed through
     *   - `{ label, subitems: Array<{ cfi, excerpt: Excerpt }> }` per section with matches
     *     (NB: the public `search()` maps the internal section `index` to a TOC
     *     `label` — it does NOT expose the raw section index)
     *   - `{ cfi, excerpt: Excerpt }` for an individual match (single-section search)
     *   - `'done'` as the last item
     */
    search(options: SearchOptions): AsyncIterableIterator<SearchResult | 'done'>;
    /** Remove all search-result highlights. */
    clearSearch(): void;

    // ---- annotations ----
    addAnnotation(annotation: Annotation, remove?: boolean): Promise<{ index: number; label: string } | undefined>;
    deleteAnnotation(annotation: Annotation): Promise<{ index: number; label: string } | undefined>;
    showAnnotation(annotation: Annotation): Promise<ResolvedTarget | undefined>;

    // ---- CFI helpers ----
    /** Build a CFI string from a section index and a `Range`. */
    getCFI(index: number, range?: Range): string;
    /** Resolve a CFI string to a `{ index, anchor(doc) }` pair. */
    resolveCFI(cfi: string): ResolvedTarget;
    /** Resolve any navigation target (CFI, href, fraction, index). */
    resolveNavigation(target: string | number | { fraction: number }): ResolvedTarget | undefined;
    /** Return the fraction at the start of every section (for sliders). */
    getSectionFractions(): number[];
    /** Get current TOC item + page-list item for an index/range. */
    getProgressOf(index: number, range: Range): {
      tocItem?: TocItem | null;
      pageItem?: TocItem | null;
    };
    /** Get the TOC item that contains the target, if any. */
    getTOCItemOf(target: string | number): Promise<TocItem | undefined>;

    // ---- TTS / media overlay ----
    initTTS(granularity?: 'word' | 'grapheme', highlight?: (range: Range) => unknown): Promise<void>;
    startMediaOverlay(): Promise<void>;

    // ---- events ----
    // Note: foliate-js dispatches these custom events on the element, but
    // we deliberately do NOT redeclare `addEventListener` here — doing so
    // makes the class no longer assignable to `HTMLElement` (the overload
    // set conflicts with the base class's wider one). Consumers should
    // use the standard `EventTarget`/`HTMLElement` `addEventListener` and
    // cast the event's `detail` to the appropriate `*Detail` type:
    //
    //     view.addEventListener('load', (e) => {
    //         const detail = (e as CustomEvent<FoliateLoadDetail>).detail
    //         ...
    //     })
    //
    // The dispatched events are:
    //   'load'           — CustomEvent<FoliateLoadDetail>
    //   'relocate'       — CustomEvent<FoliateLocation>
    //   'link'           — CustomEvent<FoliateLinkDetail>
    //   'external-link'  — CustomEvent<FoliateExternalLinkDetail>
    //   'create-overlay' — CustomEvent<FoliateCreateOverlayDetail>
    //   'show-annotation' — CustomEvent<FoliateShowAnnotationDetail>
    //   'draw-annotation'  — CustomEvent<FoliateDrawAnnotationDetail>
  }

  /**
   * The exported name is `View` in the upstream source, but the project
   * exposes the default `FoliateView` alias for ergonomics. We keep both.
   */
  export type View = FoliateView;
  export default FoliateView;

  // ---- supporting types ----

  /** Anything the engine accepts as a "book" (see upstream README §"book interface"). */
  export interface Book {
    sections: Section[];
    dir: 'ltr' | 'rtl';
    toc?: TocItem[];
    pageList?: TocItem[];
    metadata?: BookMetadata;
    rendition?: { layout?: 'pre-paginated' | 'reflowable' };
    resolveHref(href: string): ResolvedTarget;
    resolveCFI?(cfi: string): ResolvedTarget;
    isExternal?(href: string): boolean;
    splitTOCHref?(href: string): [string | number, unknown] | Promise<[string | number, unknown]>;
    getTOCFragment?(doc: Document, id: unknown): Node | null;
    transformTarget?: EventTarget;
  }

  export interface Section {
    id: string | number;
    /** Opaque base CFI (the part before `!` in a step CFI). */
    cfi?: string;
    size: number;
    linear: 'yes' | 'no' | string;
    /** Resolve this section's URL (string) — may be async. */
    load(): Promise<string>;
    /** Free resources associated with this section, if applicable. */
    unload?(): void;
    /** Return a parsed `Document` for this section, for searching. */
    createDocument?(): Promise<Document>;
    mediaOverlay?: unknown;
  }

  export interface TocItem {
    id: number;
    label: string;
    href: string;
    subitems?: TocItem[];
  }

  export interface BookMetadata {
    title?: string | Record<string, string>;
    creator?: string | string[] | Record<string, string> | Record<string, string>[];
    language?: string | string[];
    identifier?: string;
    publisher?: string | string[];
    [key: string]: unknown;
  }

  export interface ResolvedTarget {
    index: number;
    /** Returns the destination `Range` or `Element` for the given section document. */
    anchor(doc?: Document): Range | Element | null;
  }

  /** Payload of the `load` event. */
  export interface FoliateLoadDetail {
    doc: Document;
    index: number;
  }

  /**
   * Payload of the `relocate` event, and shape of `view.lastLocation`.
   * Combines progress information with the current CFI / TOC / page-list
   * items and the live `Range` that the user is looking at.
   */
  export interface FoliateLocation {
    fraction: number;
    section?: { current: number; total: number };
    location?: { current: number; next: number; total: number };
    time?: { section: number; total: number };
    tocItem?: TocItem | null;
    pageItem?: TocItem | null;
    cfi?: string;
    range?: Range;
  }

  /** Alias kept for `init({ lastLocation })` compatibility. */
  export type FoliateLastLocation = string | FoliateLocation;

  export interface FoliateLinkDetail {
    a: HTMLAnchorElement;
    href: string;
  }

  export interface FoliateExternalLinkDetail {
    a: HTMLAnchorElement;
    href_: string;
  }

  export interface FoliateCreateOverlayDetail {
    index: number;
  }

  export interface FoliateShowAnnotationDetail {
    value: string;
    index: number;
    range?: Range;
  }

  export interface FoliateDrawAnnotationDetail {
    draw: (draw: OverlayerDrawFn, opts?: unknown) => void;
    annotation: Annotation;
    doc: Document;
    range: Range;
  }

  /** Bounded history used for back/forward. */
  export interface FoliateHistory extends EventTarget {
    canGoBack: boolean;
    canGoForward: boolean;
    pushState(x: unknown): void;
    replaceState(x: unknown): void;
    back(): void;
    forward(): void;
    clear(): void;
  }

  export interface SearchOptions {
    /** Search query string. */
    query: string;
    /** Restrict search to a single section index, if provided. */
    index?: number;
    /** Override the default drawer (`Overlayer.outline`). */
    draw?: OverlayerDrawFn;
    drawOptions?: unknown;
    /** BCP-47 locale tag. */
    locales?: string | string[];
    /** `'variant'` for case-sensitive, otherwise case-insensitive. */
    sensitivity?: 'base' | 'accent' | 'case' | 'variant';
    matchCase?: boolean;
    matchDiacritics?: boolean;
    matchWholeWords?: boolean;
    /** `TreeWalker`-style filter. */
    acceptNode?: (node: Node) => number;
  }

  export type SearchResult =
    | { progress: number }
    | { label: string; subitems: Array<{ cfi: string; excerpt: Excerpt }> }
    | { cfi: string; excerpt: Excerpt };

  export interface Excerpt {
    pre: string;
    match: string;
    post: string;
  }

  export interface Annotation {
    value: string;
    [key: string]: unknown;
  }

  export type OverlayerDrawFn = (rects: DOMRect[], options?: unknown) => SVGElement;

  // ---- errors ----
  export class ResponseError extends Error {}
  export class NotFoundError extends Error {}
  export class UnsupportedTypeError extends Error {}
}

// =============================================================================
// paginator.js  — <foliate-paginator> renderer (reflowable books)
// =============================================================================

declare module '@/vendor/foliate-js/paginator.js' {
  /**
   * The `<foliate-paginator>` custom element. This is the inner renderer
   * used by `<foliate-view>` for reflowable EPUBs. It is exposed as
   * `view.renderer` once the book is opened.
   *
   * It is an `HTMLElement`, so layout is configured via **HTML attributes**
   * (NOT a JS property API; see upstream README §"The Paginator"):
   *
   *   - `flow`              — `'paginated'` (default) or `'scrolled'`
   *   - `margin`            — `<length>` in **px** (header/footer height)
   *   - `gap`               — `<percentage>` (column gap)
   *   - `max-inline-size`   — `<length>` in **px** (column width)
   *   - `max-block-size`    — `<length>` in **px** (column height)
   *   - `max-column-count`  — integer (max columns; portrait single column)
   *   - `animated`          — boolean attribute; slide transition on page change
   */
  export class FoliatePaginator extends HTMLElement {
    /** Pass the resolved book; sets up directions, sections, transformTarget. */
    open(book: import('./foliate-view.js').Book): void;
    /** Navigate to a target. */
    goTo(target: { index: number; anchor?: number | Range | Element; select?: boolean }): Promise<void>;
    /** Go to the previous page. */
    prev(distance?: number): Promise<void>;
    /** Go to the next page. */
    next(distance?: number): Promise<void>;
    /** Scroll to an anchor (Range/Element or fraction). */
    scrollToAnchor(anchor: number | Range | Element, select?: boolean): Promise<void>;
    /** Return the loaded sections — used by `<foliate-view>` to wire up overlayers. */
    getContents(): Array<{ index: number; overlayer?: unknown; doc?: Document }>;
    /**
     * Inject custom CSS into the iframe document. Accepts a single CSS
     * string or a `[before, after]` tuple. The CSS is inserted into the
     * document via a `<style>` element, so selectors can target the
     * EPUB's own XHTML.
     */
    setStyles(styles: string | [string, string]): void;
    /** Focus the iframe (used after navigation to enable keyboard shortcuts). */
    focusView(): void;
    /** Tear down — removes event listeners, observers, the inner view, etc. */
    destroy(): void;

    // ---- public state ----
    sections: import('./foliate-view.js').Section[];
    bookDir: 'ltr' | 'rtl';

    // Events: 'load' (CustomEvent<FoliateLoadDetail>), 'relocate'
    // (CustomEvent<FoliateRendererRelocate>), 'create-overlayer'
    // (CustomEvent<FoliateCreateOverlayerDetail>). See the FoliateView note
    // on why we don't redeclare addEventListener.
  }

  export type FoliateLoadDetail = import('./foliate-view.js').FoliateLoadDetail;

  export interface FoliateRendererRelocate {
    reason: 'snap' | 'page' | 'scroll' | 'anchor' | 'selection' | 'navigation' | string;
    range: Range;
    index: number;
    fraction: number;
    size: number;
  }

  export interface FoliateCreateOverlayerDetail {
    doc: Document;
    index: number;
    /** Attach a freshly-created overlayer instance. */
    attach(overlayer: unknown): void;
  }
}

// =============================================================================
// fixed-layout.js  — <foliate-fxl> renderer (pre-paginated EPUBs)
// =============================================================================

declare module '@/vendor/foliate-js/fixed-layout.js' {
  /**
   * The `<foliate-fxl>` custom element. Used for pre-paginated EPUBs
   * (e.g. comics, fixed-layout image books). view.js selects it
   * automatically when `book.rendition.layout === 'pre-paginated'`.
   *
   * Attributes: `zoom` is the only observed attribute (e.g. `'50%'`,
   * `'100%'`, `'fit-width'`, `'fit-height'`, `'page-fit'`).
   */
  export class FixedLayout extends HTMLElement {
    open(book: import('./foliate-view.js').Book): void;
    goTo(target: { index: number; anchor?: number | Range | Element; select?: boolean }): Promise<void>;
    prev(distance?: number): Promise<void>;
    next(distance?: number): Promise<void>;
    getContents(): Array<{ index: number; overlayer?: unknown; doc?: Document }>;
    setStyles(styles: string | [string, string]): void;
    focusView(): void;
    destroy(): void;

    sections: import('./foliate-view.js').Section[];
    bookDir: 'ltr' | 'rtl';

    // Events: 'load' (CustomEvent<FoliateLoadDetail>), 'relocate'
    // (CustomEvent<FoliateRendererRelocate>), 'create-overlayer'
    // (CustomEvent<FoliateCreateOverlayerDetail>). See the FoliateView note
    // on why we don't redeclare addEventListener.
  }
}

// =============================================================================
// overlayer.js  — SVG overlay used for highlights / search-result drawing
// =============================================================================

declare module '@/vendor/foliate-js/overlayer.js' {
  /** SVG overlay used to draw highlights, search matches, and annotations. */
  export class Overlayer {
    /** The `<svg>` element to mount into the iframe. */
    readonly element: SVGSVGElement;
    add(key: string, range: Range | ((root: Document) => Range), draw: (rects: DOMRect[], options?: unknown) => SVGElement, options?: unknown): void;
    remove(key: string): void;
    redraw(): void;
    hitTest(point: { x: number; y: number }): [string, Range] | [];

    /** Built-in drawer: red outline. */
    static outline(rects: DOMRect[], options?: { color?: string; width?: number }): SVGElement;
    /** Built-in drawer: filled highlight. */
    static highlight(rects: DOMRect[], options?: { color?: string }): SVGElement;
    /** Built-in drawer: underline. */
    static underline(rects: DOMRect[], options?: { color?: string; width?: number; writingMode?: string }): SVGElement;
  }
}

// =============================================================================
// epub.js  — EPUB parser/loader (the `EPUB` class)
// =============================================================================

declare module '@/vendor/foliate-js/epub.js' {
  import type { Book } from './foliate-view.js';

  /**
   * Archive loader interface — implemented by `view.js`'s
   * `makeZipLoader` (zip.js-based). Both `EPUB` and `comic-book.js` accept
   * one of these.
   */
  export interface ZipLoader {
    entries: Array<{ filename: string; [key: string]: unknown }>;
    loadText(filename: string): Promise<string | null>;
    loadBlob(filename: string, type?: string): Promise<Blob | null>;
    getSize(filename: string): number;
  }

  /** The EPUB book implementation. */
  export class EPUB {
    constructor(loader: ZipLoader);
    init(): Promise<Book>;
    static MIME: { [key: string]: string | RegExp };
  }
}

// =============================================================================
// epubcfi.js  — CFI parser/serializer helpers
// =============================================================================

declare module '@/vendor/foliate-js/epubcfi.js' {
  export const isCFI: RegExp;
  export const fake: {
    fromIndex(index: number): string;
    toIndex(part: unknown): number;
  };
  export function parse(cfi: string): CfiParts;
  export function joinIndir(...cfis: string[]): string;
  export function fromRange(range: Range, filter?: (node: Node) => number): CfiParts;
  export function toRange(doc: Document, parts: CfiParts, filter?: (node: Node) => number): Range;
  export function compare(a: CfiParts, b: CfiParts): number;
  export function collapse(x: CfiParts | string, toEnd?: boolean): CfiParts | string;
  export function fromElements(elements: Element[]): CfiParts;
  export function toElement(doc: Document, parts: CfiParts): Element | null;

  export interface CfiPart {
    index?: number;
    id?: string | number;
    offset?: number;
    temporal?: unknown;
    spatial?: unknown;
    text?: unknown;
    side?: 'before' | 'after' | 'left' | 'right';
  }
  export type CfiPath = CfiPart[];
  export interface CfiRangeParts {
    parent: CfiPath;
    start: CfiPath;
    end: CfiPath;
  }
  export type CfiParts = CfiPath | CfiRangeParts;
}

// =============================================================================
// progress.js  — section / TOC progress calculators
// =============================================================================

declare module '@/vendor/foliate-js/progress.js' {
  import type { TocItem } from './foliate-view.js';

  export class SectionProgress {
    constructor(sections: Array<{ size: number; linear: string }>, sizePerLoc: number, sizePerTimeUnit: number);
    sizes: number[];
    sizePerLoc: number;
    sizePerTimeUnit: number;
    sizeTotal: number;
    sectionFractions: number[];
    getProgress(
      index: number,
      fractionInSection: number,
      pageFraction?: number,
    ): {
      fraction: number;
      section: { current: number; total: number };
      location: { current: number; next: number; total: number };
      time: { section: number; total: number };
    };
    /** Inverse of `getProgress` — return `[index, fractionInSection]`. */
    getSection(fraction: number): [number, number];
  }

  export class TOCProgress {
    async init(options: {
      toc: TocItem[];
      ids: Array<string | number>;
      splitHref(href: string): Promise<[string | number, unknown]>;
      getFragment(doc: Document, fragment: unknown): Node | null;
    }): Promise<void>;
    getProgress(index: number, range: Range): TocItem | null | undefined;
  }
}

// =============================================================================
// search.js  — search matchers
// =============================================================================

declare module '@/vendor/foliate-js/search.js' {
  export interface SearchOpts {
    defaultLocale?: string | Intl.Locale;
    matchCase?: boolean;
    matchDiacritics?: boolean;
    matchWholeWords?: boolean;
    acceptNode?: (node: Node) => number;
  }
  export type Matcher = (doc: Document, query: string) => Iterable<{ range: Range; excerpt: { pre: string; match: string; post: string } }>;
  export function searchMatcher(
    textWalker: typeof import('./text-walker.js').textWalker,
    opts: SearchOpts,
  ): Matcher;
}

// =============================================================================
// text-walker.js  — DOM TreeWalker wrapper
// =============================================================================

declare module '@/vendor/foliate-js/text-walker.js' {
  /**
   * Walks a `Document` (or `Range`), invoking `func(strs, makeRange)`
   * per text-node group. Used by `search.js` to match against concatenated
   * text.
   */
  export function textWalker(
    root: Document | Range,
    func: (
      strs: string[],
      makeRange: (startIndex: number, startOffset: number, endIndex: number, endOffset: number) => Range,
    ) => Iterable<{ range: Range; excerpt: { pre: string; match: string; post: string } }>,
    filterFunc?: (node: Node) => number,
  ): Generator<{ range: Range; excerpt: { pre: string; match: string; post: string } }>;
}

// =============================================================================
// tts.js  — text-to-speech helper
// =============================================================================

declare module '@/vendor/foliate-js/tts.js' {
  export class TTS {
    constructor(
      doc: Document,
      textWalker: typeof import('./text-walker.js').textWalker,
      highlight?: (range: Range) => unknown,
      granularity?: 'word' | 'grapheme',
    );
    doc: Document;
  }
}

// =============================================================================
// footnotes.js  — EPUB endnote / pop-up helper
// =============================================================================

declare module '@/vendor/foliate-js/footnotes.js' {
  export class FootnoteHandler extends EventTarget {
    constructor(doc: Document);
  }
}

// =============================================================================
// uri-template.js  — RFC 6570 URI Template parser
// =============================================================================

declare module '@/vendor/foliate-js/uri-template.js' {
  export function replace(str: string, map: Record<string, string | number>): string;
  export function getVariables(str: string): Set<string>;
}
