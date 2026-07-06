/**
 * Reader UI constants (ISD §11.G).
 *
 * Centralised configuration for the reader chrome, controls, and gestures.
 * Keeping these in one place makes the rules easy to tune and test.
 */

/**
 * Fraction of the viewport width (each side) that constitutes a "tap zone".
 * ISD §11.BB: left third = prev, right third = next, center = toggle chrome.
 */
export const TAP_ZONE_RATIO = 0.33;

/**
 * Idle time after which the auto-hiding chrome hides itself.
 * ISD §11.BB: 3 seconds is a good Kindle-style balance.
 */
export const CHROME_IDLE_MS = 3000;

/**
 * Font size limits and step (in pixels).
 * Live updates flow through the existing `setStyles` pipeline.
 */
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 32;
export const FONT_SIZE_STEP = 1;

/**
 * Line height limits and step.
 */
export const LINE_HEIGHT_MIN = 1.2;
export const LINE_HEIGHT_MAX = 2.0;
export const LINE_HEIGHT_STEP = 0.1;

/**
 * Page margin limits and step (as a percentage of the viewport height).
 * Maps to the engine renderer `margin` attribute in pixels.
 */
export const MARGIN_MIN = 0;
export const MARGIN_MAX = 40;
export const MARGIN_STEP = 2;

/**
 * Search behaviour.
 */
export const SEARCH_DEBOUNCE_MS = 350;
export const SEARCH_QUERY_MIN = 1;
export const SEARCH_QUERY_MAX = 200;
export const SEARCH_MAX_RESULTS = 200;

/**
 * Threshold for the swipe gesture — pixels of horizontal motion before a
 * swipe is recognised. 50px ≈ 8% of a 600px wide viewport.
 */
export const SWIPE_THRESHOLD_PX = 50;

/**
 * Max time for a press to count as a "tap" (vs. a long-press / selection).
 */
export const TAP_MAX_MS = 250;

/**
 * Available font family choices.
 * Each is a valid CSS font-family value.
 */
export const FONT_FAMILY_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Bookerly', value: 'Bookerly, "Amazon Ember", Georgia, serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Sans-serif', value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { label: 'Monospace', value: 'ui-monospace, "SF Mono", Menlo, monospace' },
  { label: 'Dyslexic-friendly', value: 'Verdana, Geneva, sans-serif' },
];

/**
 * Available themes.
 */
export const THEME_OPTIONS: ReadonlyArray<{ label: string; value: 'light' | 'sepia' | 'dark' }> = [
  { label: 'Light', value: 'light' },
  { label: 'Sepia', value: 'sepia' },
  { label: 'Dark', value: 'dark' },
];

/**
 * Keyboard shortcut map.
 *
 * Keys are normalized lowercase. The handler reads the active element first
 * to avoid stealing keys while a panel input is focused (ISD §11.BB).
 *
 * - ←/→/Space/PageUp/PageDown/Enter: navigate pages
 * - Esc: close the active panel (or hide chrome)
 * - `/` : open search
 * - `t` : cycle theme
 * - `+`/`-`/`=`: increase/decrease font size
 * - `c` : toggle chrome
 * - `Home`/`End`: goTo first/last
 */
export interface ShortcutDefinition {
  /** Human description (used by screen readers and tooltip). */
  description: string;
  /** Bound key combos (lowercase). */
  keys: string[];
}

/**
 * The frozen shortcut map. Declared `as const` so the literal types are
 * preserved at compile time (Object.freeze would erase them).
 */
export const SHORTCUTS = {
  prev: { description: 'Previous page', keys: ['arrowleft', 'pageup'] },
  next: { description: 'Next page', keys: ['arrowright', 'pagedown', ' ', 'enter'] },
  close: { description: 'Close panel / hide chrome', keys: ['escape'] },
  search: { description: 'Open search', keys: ['/'] },
  cycleTheme: { description: 'Cycle theme', keys: ['t'] },
  increaseFont: { description: 'Increase font size', keys: ['+', '='] },
  decreaseFont: { description: 'Decrease font size', keys: ['-'] },
  toggleChrome: { description: 'Toggle chrome', keys: ['c'] },
  toggleFullscreen: { description: 'Toggle fullscreen', keys: ['f'] },
} as const satisfies Record<string, ShortcutDefinition>;
