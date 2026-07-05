/**
 * Stub for format adapters that this app does not support.
 *
 * The real foliate-js project ships adapters for several book formats
 * (CBZ, FB2, PDF, MOBI/KF8) that the <foliate-view> element
 * dynamic-imports when a non-EPUB file is opened. This app is EPUB-only
 * per the ISD, so we replace those dynamic imports with this stub that
 * throws a clear `UnsupportedTypeError` at runtime.
 *
 * This keeps the build graph resolvable (webpack otherwise fails on the
 * missing dynamic-import targets) without pulling in PDF.js,
 * MOBI's HUFF/CDIC decompressor, FB2, or CBZ dependencies we never
 * execute.
 *
 * This file is referenced from `next.config.ts` via `webpack.resolve.alias`,
 * which maps each unsupported format adapter path to this stub. The named
 * exports cover every symbol `view.js` might destructure from those
 * adapters.
 *
 * @see src/vendor/foliate-js/VENDOR.md for the full list of vendored /
 * excluded files.
 */

class UnsupportedTypeError extends Error {
  constructor(format) {
    super(`Unsupported book format: ${format}. This app only supports EPUB.`);
    this.name = 'UnsupportedTypeError';
  }
}

const notSupported = (format) => {
  throw new UnsupportedTypeError(format);
};

// ---- cb2 (comic-book.js) ----
export const makeComicBook = () => notSupported('CBZ');

// ---- fb2 (fb2.js) ----
export const makeFB2 = () => notSupported('FB2/FBZ');

// ---- pdf (pdf.js) ----
export const makePDF = () => notSupported('PDF');

// ---- mobi (mobi.js) ----
export const isMOBI = async () => false;
export class MOBI {
  open() {
    notSupported('MOBI/KF8');
  }
}
