# foliate-js Vendor Documentation

## Source Information

- **Repository**: https://github.com/johnfactotum/foliate-js
- **Upstream source URL** (pinned commit):
  https://github.com/johnfactotum/foliate-js/tree/78914aef4466eb960965702401634c2cb348e9b1
- **Commit Hash**: `78914aef4466eb960965702401634c2cb348e9b1` — short `78914ae`
- **Commit Subject**: "Use original hrefs for external links and add isExternal in fb2.js (#129)"
- **Commit Date**: 2026-05-01 (UTC)
- **Author**: Francesco Martini (wrCisco)
- **License**: MIT (Copyright © 2022 John Factotum) — see [`LICENSE`](./LICENSE)
- **Vendored Date**: 2026-07-05

> Note: The previous version of this document stated the license as MPL-2.0. The
> upstream `LICENSE` file and the project's `package.json` both declare MIT, so
> this document has been corrected.

## Vendoring Rationale

foliate-js is a collection of native ES modules (not a stable, semver-pinned npm
package) that render sandboxed `<iframe>`s for EPUB content. It has no hard
runtime dependencies for EPUB rendering (it bundles its own zip and inflate
helpers under `vendor/`).

Per ISD §9.E, foliate-js is **vendored into the repo** at a pinned commit rather
than fetched at runtime to ensure:

1. Reproducible builds (no external network dependency)
2. Security auditability (vendored code is reviewed and frozen)
3. Client-only loading via `next/dynamic` with `ssr: false`

## Vendoring Process (for maintainers)

To update or initially populate this directory:

```bash
# Clone foliate-js at a specific commit
git clone https://github.com/johnfactotum/foliate-js.git /tmp/foliate-js
cd /tmp/foliate-js
git checkout 78914aef4466eb960965702401634c2cb348e9b1

# Copy runtime JavaScript modules required to render an EPUB.
# Excludes: tests/, ui/, rollup/, rollup.config.js, package*.json,
# eslint.config.js, .github/, .gitattributes, .gitignore, README.md.
cp view.js                 src/vendor/foliate-js/foliate-view.js
cp epub.js                 src/vendor/foliate-js/epub.js
cp epubcfi.js              src/vendor/foliate-js/epubcfi.js
cp paginator.js            src/vendor/foliate-js/paginator.js
cp fixed-layout.js         src/vendor/foliate-js/fixed-layout.js
cp overlayer.js            src/vendor/foliate-js/overlayer.js
cp progress.js             src/vendor/foliate-js/progress.js
cp search.js               src/vendor/foliate-js/search.js
cp text-walker.js          src/vendor/foliate-js/text-walker.js
cp tts.js                  src/vendor/foliate-js/tts.js
cp footnotes.js            src/vendor/foliate-js/footnotes.js
cp uri-template.js         src/vendor/foliate-js/uri-template.js
cp quote-image.js          src/vendor/foliate-js/quote-image.js
cp LICENSE                 src/vendor/foliate-js/LICENSE

# zip.js and fflate.js are minified ESM bundles shipped by upstream.
# Preserve the relative `vendor/` subdirectory because the upstream source
# references them as './vendor/zip.js' and './vendor/fflate.js'.
mkdir -p                   src/vendor/foliate-js/vendor
cp vendor/zip.js           src/vendor/foliate-js/vendor/zip.js
cp vendor/fflate.js        src/vendor/foliate-js/vendor/fflate.js

# Update this document with the new commit hash and re-run typecheck/lint/build.
```

## Files Included

The following modules are vendored (runtime, all MIT-licensed):

| File               | Role                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foliate-view.js`  | The `<foliate-view>` custom element (renamed from upstream `view.js`). Imports the rest of the modules and is the single entry point registered as a custom element. |
| `epub.js`          | EPUB parser/loader implementing the "book" interface (sections, manifest, spine, OPF, NCX, nav).                                                                     |
| `epubcfi.js`       | EPUB CFI (Canonical Fragment Identifier) parser and serializer.                                                                                                      |
| `paginator.js`     | The `<foliate-paginator>` renderer for reflowable books (CSS multi-column layout). Implements the real `next()`, `prev()`, `goTo()`, `setStyles()` API.              |
| `fixed-layout.js`  | The `<foliate-fxl>` renderer for pre-paginated EPUBs (view.js dynamic-imports it when the book's `rendition.layout === "pre-paginated"`).                            |
| `overlayer.js`     | SVG-based overlay layer used for highlights, search-result drawing, and annotations.                                                                                 |
| `progress.js`      | `SectionProgress` and `TOCProgress` helpers for computing reading fraction / current TOC item.                                                                       |
| `search.js`        | Search matchers and excerpt generation (driven by `text-walker.js`).                                                                                                 |
| `text-walker.js`   | Generic DOM `TreeWalker` wrapper that feeds the search module.                                                                                                       |
| `tts.js`           | TTS (text-to-speech) helper, dynamic-imported by view.js.                                                                                                            |
| `footnotes.js`     | Footnote/pop-up helpers (EPUB endnotes, popups, etc.).                                                                                                               |
| `uri-template.js`  | RFC 6570 URI Template parser (used for OPDS and similar).                                                                                                            |
| `quote-image.js`   | Helper used by some book formats to draw quote marks.                                                                                                                |
| `LICENSE`          | Upstream MIT license text.                                                                                                                                           |
| `vendor/zip.js`    | Minified bundle of `@zip.js/zip.js` (zip reading/writing).                                                                                                           |
| `vendor/fflate.js` | Minified bundle of `fflate` (used by `mobi.js` for KF8 font decompression).                                                                                          |

## Files Excluded

The following upstream paths are **deliberately not vendored** because they are
not needed for EPUB-only rendering in this app (they target other book formats
or are tooling / docs):

- `comic-book.js` — CBZ format
- `fb2.js` — FictionBook 2 format
- `mobi.js` — MOBI / KF8 (AZW3) format
- `pdf.js` — PDF.js adapter (experimental)
- `opds.js` — OPDS catalog browser
- `dict.js` — Dictionary (dictd / StarDict) format
- `reader.html`, `reader.js`, `ui/` — The upstream demo reader (not part of the
  library proper; we have our own `ReaderView` React component).
- `rollup/`, `rollup.config.js` — Upstream build configuration.
- `package.json`, `package-lock.json` — npm metadata (not needed for vendoring).
- `eslint.config.js` — Upstream linting configuration.
- `tests/`, `tests.html`, `tests.js` — Upstream tests.
- `README.md`, `.github/`, `.gitignore`, `.gitattributes` — Docs / metadata.
- `vendor/pdfjs/` — PDF.js worker and assets (only needed by `pdf.js`).

If a future feature requires one of these (e.g., adding PDF support), vendor it
into this directory and update the file table above.

## Type Declarations

Ambient TypeScript declarations are provided in [`foliate.d.ts`](./foliate.d.ts)
(sibling file). These are hand-authored since foliate-js ships no types, and
they cover the public surface of `<foliate-view>` that the
`FoliateEngine` adapter (and any future direct consumer) needs.

## Renaming Note

The upstream entry-point file is `view.js`, which exports the `View` class
and registers the `<foliate-view>` custom element. To keep the import path
`@/vendor/foliate-js/foliate-view.js` (and to match the name of the custom
element), the file is renamed to `foliate-view.js` on copy. All `import`
paths inside the file remain `./<module>.js` so no source edits are required.

## Security Notes

- foliate-js renders untrusted EPUB content in a **sandboxed iframe** (only
  `allow-same-origin` is granted; the README explicitly warns that
  `allow-scripts` cannot be used safely because of the same-origin `blob:`
  iframe and WebKit bug 218086).
- The sandbox must NOT be relaxed.
- React must NEVER directly access the iframe DOM (ISD §9.B strict isolation).
- All communication goes through the `ReaderEngine` interface
  (`src/features/reader/engine/types.ts`).
- CSP permits `blob:` for `frame-src` and `img-src` (configured in
  `src/lib/http/headers.ts`). `script-src` is locked down to `'self'`, which
  neutralises scripted EPUB content.

## Integration

The integration is implemented in:

- `src/features/reader/engine/foliate-engine.ts` — Adapter wrapping
  foliate-js in the `ReaderEngine` interface.
- `src/features/reader/hooks/use-reader-engine.ts` — React hook bridging
  React and the engine.
- `src/features/reader/components/reader-view.tsx` — Client component
  mounting the engine.
- `src/features/reader/lib/styles-mapper.ts` — Maps `ReaderStyle` (from
  `reader-store`) to the CSS string consumed by the inner
  `<foliate-paginator>` via `view.renderer.setStyles(...)`.

## Updating

When updating foliate-js:

1. Record the new commit hash in this document.
2. Review the diff for breaking changes to the API surface (especially
   `view.js`, `paginator.js`, `epub.js`).
3. Update `foliate.d.ts` if the API changes.
4. Update `foliate-engine.ts` if the integration pattern changes
   (event payloads, `init()` options, search results, etc.).
5. Update `styles-mapper.ts` if the way styles are applied to the renderer
   changes.
6. Run `pnpm typecheck && pnpm lint && pnpm build && pnpm test` to verify.
7. Test thoroughly — foliate-js is the core rendering engine.
