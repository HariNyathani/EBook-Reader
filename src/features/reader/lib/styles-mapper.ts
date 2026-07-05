/**
 * Styles mapper — maps reader-store state to a CSS string for the
 * <foliate-paginator>/<foliate-fxl> renderer's `setStyles()`.
 *
 * ISD §9.F: Single source of truth for reader theme palettes and style mapping.
 * The useReaderEngine hook calls `mapStateToStyle()` then `mapStyleToCss()`
 * whenever the reader-store typography/theme state changes, and the
 * FoliateEngine forwards the resulting CSS string to the renderer.
 *
 * SAD §5.2: Style injection via CSS variables + !important overrides. The
 * renderer injects this CSS into the EPUB's iframe `<style>` element, so
 * it sits alongside the EPUB's own stylesheet; `!important` is used to
 * ensure user-chosen typography takes precedence over the publisher's
 * defaults.
 *
 * NOTE on CSS specificity: We do not target the XHTML root because some
 * EPUBs set explicit `font-family` on the `<html>` element, which would
 * win against plain `body { … }` rules. We target a broad list of
 * content-level elements instead.
 */

import type { ReaderStyle, ReaderTheme } from '../engine/types';

/**
 * Theme palette definitions.
 * Maps theme names to background/foreground color pairs.
 */
export const themePalette: Record<ReaderTheme, { bg: string; fg: string }> = {
  light: { bg: '#ffffff', fg: '#1a1a1a' },
  sepia: { bg: '#f4ecd8', fg: '#5b4636' },
  dark: { bg: '#1a1a1a', fg: '#e0e0e0' },
};

/**
 * The set of HTML/XHTML elements whose typography the user can override.
 * Matches the elements that publishers typically style in EPUBs.
 */
const TYPOGRAPHY_SELECTORS = [
  'body',
  'p',
  'div',
  'span',
  'li',
  'blockquote',
  'q',
  'cite',
  'em',
  'strong',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'td',
  'th',
].join(', ');

/**
 * Maps a `ReaderStyle` to a CSS string suitable for
 * `view.renderer.setStyles(cssString)`.
 *
 * The CSS targets common content elements with `!important` to override
 * the EPUB's publisher-provided styles, and sets the page background on
 * `html, body` so the iframe (which derives its background from the
 * document) reflects the chosen theme.
 */
export function mapStyleToCss(style: ReaderStyle): string {
  const palette = themePalette[style.theme];
  const fontSizePx = Math.max(8, Math.round(style.fontSizePx));
  const lineHeight = String(style.lineHeight);
  const marginPct = Math.max(0, Math.min(50, style.marginPct));
  const textAlign = style.textAlign === 'justify' ? 'justify' : 'start';
  const fontFamily = escapeForCssString(style.fontFamily);
  const bg = palette.bg;
  const fg = palette.fg;

  // The paginator's `getBackground()` reads `body` first, then falls back
  // to `html` if the body is transparent. Setting both ensures the iframe
  // always reflects the chosen theme even if the EPUB forces a transparent
  // body background.
  return [
    `html, body { background: ${bg} !important; color: ${fg} !important; }`,
    `${TYPOGRAPHY_SELECTORS} {`,
    `  font-family: ${fontFamily} !important;`,
    `  font-size: ${fontSizePx}px !important;`,
    `  line-height: ${lineHeight} !important;`,
    `  text-align: ${textAlign} !important;`,
    `}`,
    // The paginator's `margin` attribute (set by the engine wrapper)
    // controls the header/footer height. We expose the user's `marginPct`
    // as a CSS custom property on :root so future style sheets can read it.
    `:root { --reader-margin-pct: ${marginPct}%; }`,
  ].join('\n');
}

/**
 * Escape a string for safe inclusion in a CSS `font-family` value.
 * Wraps the value in double quotes if it contains characters that would
 * break a bare identifier, and escapes internal double quotes.
 */
function escapeForCssString(value: string): string {
  // If the value is already a comma-separated list of font names, we
  // trust the caller (this comes from the user's reader-store config).
  // We just need to make sure each name is a valid CSS identifier list,
  // so quote any name that contains a space or quote.
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return names
    .map((name) => {
      // Generic family keywords (serif, sans-serif, monospace, etc.) are
      // valid bare identifiers.
      if (/^[a-zA-Z-]+$/.test(name)) return name;
      // Otherwise quote-wrap. If the name itself contains quotes, fall
      // back to escaping them — though in practice font names never do.
      return `"${name.replace(/"/g, '\\"')}"`;
    })
    .join(', ');
}

/**
 * Maps reader-store state to a ReaderStyle object.
 *
 * ISD §9.C (Decision C): The reader-store holds the durable typography
 * fields (theme, fontFamily, fontSize, lineHeight, margin, textAlign).
 * This function extracts them into the ReaderStyle shape expected by the
 * engine.
 */
export function mapStateToStyle(state: {
  theme: ReaderTheme;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  margin: number;
  textAlign: 'start' | 'justify';
}): ReaderStyle {
  return {
    theme: state.theme,
    fontFamily: state.fontFamily,
    fontSizePx: state.fontSize,
    lineHeight: state.lineHeight,
    marginPct: state.margin,
    textAlign: state.textAlign,
  };
}
