'use client';

/**
 * FoliateEngine adapter — wraps the vendored <foliate-view> custom element
 * in the format-agnostic ReaderEngine interface.
 *
 * ISD §9.F: This is the sole adapter for the foliate-js renderer. It translates
 * the real foliate-js events (`load`, `relocate`, `link`, etc.) into
 * `ReaderEngineEvent` and implements the `ReaderEngine` command API by
 * delegating to the vendored `<foliate-view>` element.
 *
 * The wrapper is intentionally thin. It does NOT try to re-shape the
 * foliate-js API — instead it maps the upstream surface onto ours:
 *
 *   - foliate-js: `view.open(blob|file|url|book)` → engine.open(...)
 *     foliate-js: `view.init({ lastLocation, showTextStart })` → engine.open
 *     foliate-js: `view.close()` → engine.destroy
 *     foliate-js: `view.next()` / `view.prev()` → engine.next() / engine.prev()
 *     foliate-js: `view.goTo(target)` → engine.goTo(target)
 *     foliate-js: `view.search({ query })` async iterator → engine.search(query)
 *     foliate-js: `view.book.toc` (with `subitems`) → engine 'ready' event TOC
 *     foliate-js: `view.renderer.setStyles(cssString)` → engine.setStyles(...)
 *     foliate-js: `view.renderer.setAttribute('margin', ...)` for layout
 *     foliate-js: `relocate` event detail (cfi, fraction, range, tocItem) →
 *       engine 'relocate' event location
 *
 * SAD §5.1: React must NEVER directly access the iframe/DOM. This adapter
 * encapsulates all DOM interaction. The `useReaderEngine` hook is the only
 * React-side bridge.
 *
 * SECURITY: The <foliate-view> element renders EPUB content in a sandboxed
 * iframe. This adapter does not expose the iframe to React.
 */

import type { ReaderEngine, ReaderEngineEvent, ReaderStyle, TocItem, SearchResult } from './types';
import { mapStyleToCss } from '../lib/styles-mapper';
// Type-only imports of the vendored foliate-js module — these resolve to
// the ambient declarations in src/vendor/foliate-js/foliate.d.ts. We import
// from the actual JS module path (not the .d.ts file) so that TypeScript
// sees them as members of the declared module shape.
import type { FoliateView, FoliateLocation } from '@/vendor/foliate-js/foliate-view.js';
import type { TocItem as FoliateTocItem } from '@/vendor/foliate-js/foliate-view.js';

// Dynamic import of the vendored foliate-view module.
// The module registers the <foliate-view> custom element on load, so we
// keep a single shared promise to dedupe concurrent imports.
let foliateViewModule: Promise<typeof import('@/vendor/foliate-js/foliate-view.js')> | null = null;

function loadFoliateView() {
  if (!foliateViewModule) {
    foliateViewModule = import('@/vendor/foliate-js/foliate-view.js');
  }
  return foliateViewModule;
}

/**
 * FoliateEngine — adapts <foliate-view> to the ReaderEngine interface.
 *
 * Lifecycle:
 * 1. Construct with a container `HTMLElement` (the mount point for the
 *    `<foliate-view>` element).
 * 2. Call `open(source)` to load the EPUB.
 * 3. Subscribe to events via `on()`.
 * 4. Send commands (`next` / `prev` / `goTo` / `setStyles`).
 * 5. Call `destroy()` to unmount and release resources.
 */
export class FoliateEngine implements ReaderEngine {
  #container: HTMLElement;
  #view: FoliateView | null = null;
  #handlers: Set<(e: ReaderEngineEvent) => void> = new Set();
  #boundListeners: {
    load?: (e: Event) => void;
    relocate?: (e: Event) => void;
  } = {};
  #destroyed = false;
  #ready = false;

  constructor(container: HTMLElement) {
    this.#container = container;
  }

  /**
   * Opens an EPUB from a Blob, File, or objectURL string.
   *
   * The real foliate-js `open()` accepts a `File`, `Blob`, URL string, or
   * a pre-built `Book` object. We then call `init({ showTextStart: true })`
   * so the first linear section is opened automatically (matching the
   * placeholder's behavior of "load the first spine item").
   */
  async open(source: Blob | File | string): Promise<void> {
    if (this.#destroyed) throw new Error('Engine already destroyed');

    // Load the foliate-view module (registers the <foliate-view> custom element).
    await loadFoliateView();

    // Create the <foliate-view> element.
    const view = document.createElement('foliate-view') as FoliateView;
    this.#view = view;

    // Custom elements default to `display: inline` with no intrinsic size,
    // and the vendored <foliate-view> ships NO `:host` sizing of its own
    // (only its inner paginator is `height: 100%`). Without an explicit
    // block box that fills the mount container, <foliate-view> collapses to
    // zero height, the paginator renders into a 0×0 box, and the reader
    // shows a BLANK screen (and, having no laid-out pages, emits relocate
    // with fraction 0 — which is why the scrubber snapped back to 0%).
    // The container is `absolute inset-0` inside an `h-screen` main, so it
    // has real dimensions; we just need the element to fill it.
    view.style.display = 'block';
    view.style.width = '100%';
    view.style.height = '100%';

    // Attach event listeners. foliate-js emits `load` for every section
    // that finishes loading, and `relocate` on every visible-page change.
    this.#boundListeners.load = (e: Event) => {
      // (no-op for the event detail — kept silent)
      void e;
      // foliate-js emits `load` for EVERY section that finishes loading
      // (i.e. on every chapter navigation), so we must guard: only the FIRST
      // load is our 'ready' signal. Subsequent section loads are already
      // reflected by `relocate` events. Without this guard, `ready` would be
      // re-emitted on every chapter change — and since useReaderEngine re-runs
      // `goTo(initialCfi)` on `ready`, the reader would be yanked back to the
      // resume position every time the user crosses into a new section.
      if (this.#ready) return;
      this.#ready = true;
      this.#emit({
        type: 'ready',
        toc: this.#mapToc(view.book?.toc ?? []),
        totalFraction: 1,
      });
    };

    this.#boundListeners.relocate = (e: Event) => {
      const detail = (e as CustomEvent<FoliateLocation>).detail;
      if (!detail) return;
      this.#emit({
        type: 'relocate',
        location: {
          cfi: detail.cfi ?? '',
          fraction: detail.fraction ?? 0,
          chapterHref: detail.tocItem?.href,
        },
      });
    };

    // foliate-js does not emit a dedicated `error` event; errors from
    // `open()` (network failure, corrupt EPUB, unsupported type) propagate
    // as a rejected promise. We surface them via the same `error` channel
    // by wrapping the `await` below in a try/catch.
    view.addEventListener('load', this.#boundListeners.load);
    view.addEventListener('relocate', this.#boundListeners.relocate);

    // Mount the element.
    this.#container.appendChild(view);

    // Open the book. foliate-js's open() resolves once the first section
    // begins loading (not once it's done loading) — but the first `load`
    // event fires once it has finished.
    try {
      await view.open(source);
      // Initialise the reader. `showTextStart: true` jumps to the start of
      // the body matter (or first linear section), which is the equivalent
      // of "open to first page" for our purposes.
      await view.init({ showTextStart: true });
    } catch (err) {
      this.#emit({
        type: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    }
  }

  /**
   * Destroys the engine, unmounts the <foliate-view> element, and releases
   * resources. The real foliate-js method is `close()` (NOT `destroy()`).
   */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;

    // Remove event listeners.
    if (this.#view) {
      if (this.#boundListeners.load) {
        this.#view.removeEventListener('load', this.#boundListeners.load);
      }
      if (this.#boundListeners.relocate) {
        this.#view.removeEventListener('relocate', this.#boundListeners.relocate);
      }

      // Close the view (frees the inner renderer / sections / listeners).
      try {
        this.#view.close();
      } catch (err) {
        console.error('[FoliateEngine] Error closing view:', err);
      }

      // Unmount from container.
      if (this.#view.parentNode) {
        this.#view.parentNode.removeChild(this.#view);
      }
    }

    this.#view = null;
    this.#handlers.clear();
    this.#boundListeners = {};
  }

  /**
   * Navigates to the next page/spread.
   */
  next(): void {
    if (this.#view) void this.#view.next();
  }

  /**
   * Navigates to the previous page/spread.
   */
  prev(): void {
    if (this.#view) void this.#view.prev();
  }

  /**
   * Navigates to a target. Accepts a CFI string, an href, a fraction
   * (number or `{ fraction: number }`), or a section index (number).
   */
  async goTo(target: string): Promise<void> {
    if (!this.#view) return;
    // foliate-js's resolveNavigation interprets targets by TYPE, not just
    // value: a `string` is a CFI or href, a bare `number` is a *section
    // index*, and only an object `{ fraction }` is an overall reading
    // fraction. Our public surface is a string, and the progress scrubber
    // passes an overall fraction as a numeric string (e.g. "0.15", "0",
    // "1"). If we forwarded that verbatim it would fall through to
    // `book.resolveHref("0.15")` and fail silently — the reader would not
    // move and the bar would snap back. So we normalise a 0..1 fraction
    // string into the `{ fraction }` form; CFIs and hrefs pass through.
    try {
      await this.#view.goTo(toFoliateTarget(target));
    } catch (err) {
      // foliate-js logs to console itself; surface a structured error to
      // the host so the React layer can react.
      this.#emit({
        type: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  /**
   * Injects reader styles (theme + typography) into the iframe.
   *
   * The real foliate-js renderer exposes a `setStyles(cssString | [before, after])`
   * method on its inner `<foliate-paginator>` / `<foliate-fxl>`. We also set the
   * `margin` HTML attribute (which the paginator uses for the header / footer
   * height) since the existing ReaderStyle carries a percentage margin that
   * needs to be converted to a pixel length.
   */
  setStyles(style: ReaderStyle): void {
    const view = this.#view;
    if (!view?.renderer) return;

    // The renderer's setStyles can fail if no document is loaded yet
    // (e.g. styles are applied before the first `load` event). The
    // paginator's setStyles is a no-op in that case, so we don't need
    // to guard further.
    try {
      const css = mapStyleToCss(style);
      if ('setStyles' in view.renderer && typeof view.renderer.setStyles === 'function') {
        view.renderer.setStyles(css);
      }

      // Map the `marginPct` (0..50 typically) to a pixel length. The
      // paginator uses the `margin` attribute as the header/footer height,
      // not the page margin per se — but it's the only layout knob that
      // matches the intent of "give the text more breathing room".
      const marginPx = Math.max(0, Math.round((window.innerHeight * style.marginPct) / 100));
      view.renderer.setAttribute('margin', `${marginPx}px`);
    } catch (err) {
      // Style application is best-effort; don't crash the reader.
      console.error('[FoliateEngine] setStyles error:', err);
    }
  }

  /**
   * Searches the book for a query string.
   *
   * foliate-js's `search({ query })` returns an async iterator that yields
   * a mix of progress events, per-section result groups (with `subitems`),
   * individual matches (with `cfi` + `excerpt`), and finally `'done'`. We
   * normalise this to the simple `AsyncIterable<SearchResult>` shape the
   * ReaderEngine contract exposes.
   */
  async *search(query: string): AsyncIterable<SearchResult> {
    const view = this.#view;
    if (!view) return;

    const iter = view.search({ query });
    for await (const result of iter) {
      if (result === 'done') break;

      // Progress events ({ progress: number }) — skip.
      if ('progress' in result) continue;

      // Per-section results: { label, subitems: [{ cfi, excerpt: { pre, match, post } }] }
      // NB: the public search() exposes the section's TOC `label`, not its raw
      // index, so we cannot derive a chapter href here — the CFI itself is the
      // authoritative location and is sufficient for navigation.
      if ('subitems' in result) {
        for (const sub of result.subitems) {
          yield {
            cfi: sub.cfi,
            excerpt: formatExcerpt(sub.excerpt),
          };
        }
        continue;
      }

      // Single-section result: { cfi, excerpt: { pre, match, post } }
      if ('cfi' in result) {
        yield {
          cfi: result.cfi,
          excerpt: formatExcerpt(result.excerpt),
        };
        continue;
      }
    }
  }

  /**
   * Subscribes to engine events.
   */
  on(handler: (e: ReaderEngineEvent) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  /**
   * Emit an event to all subscribed handlers.
   */
  #emit(event: ReaderEngineEvent): void {
    for (const handler of this.#handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('[FoliateEngine] Event handler error:', err);
      }
    }
  }

  /**
   * Map foliate's TOC structure (`subitems`) to the engine's `TocItem`
   * (`children`).
   */
  #mapToc(entries: FoliateTocItem[]): TocItem[] {
    return entries.map((entry) => ({
      label: entry.label,
      href: entry.href,
      children:
        entry.subitems && entry.subitems.length > 0 ? this.#mapToc(entry.subitems) : undefined,
    }));
  }
}

/**
 * Flatten a foliate-js excerpt object (`{ pre, match, post }`) into a single
 * string suitable for the engine's `SearchResult.excerpt` field. Ellipses
 * are inserted by foliate-js only when the surrounding context is long
 * enough, so a simple `pre + match + post` is correct.
 */
function formatExcerpt(excerpt: { pre: string; match: string; post: string }): string {
  return `${excerpt.pre}${excerpt.match}${excerpt.post}`;
}

/**
 * Normalise a ReaderEngine `goTo` string target into the shape foliate-js
 * expects. A numeric string in the range [0, 1] (what the progress scrubber
 * sends) becomes an overall-reading-fraction object `{ fraction }`; any
 * other string (CFI or href) is passed through unchanged.
 *
 * This is required because foliate's `resolveNavigation` keys off the target
 * TYPE: a bare number is a section index and a numeric string resolves as an
 * href — neither of which is "seek to 15% of the book". Only `{ fraction }`
 * routes through `SectionProgress.getSection()`.
 */
export function toFoliateTarget(target: string): string | { fraction: number } {
  // Looks like a plain decimal (e.g. "0", "1", "0.15", ".5")?
  if (/^\s*\d*\.?\d+\s*$/.test(target)) {
    const fraction = Number(target);
    if (Number.isFinite(fraction) && fraction >= 0 && fraction <= 1) {
      return { fraction };
    }
  }
  return target;
}
