/**
 * Preferences migration utility (ISD §12.I, §12.X).
 *
 * `migratePreferences` takes an arbitrary value (typically a parsed
 * localStorage blob or a row from the `user_preferences` table) and
 * returns a `ReaderPreferences`-compatible object, performing any
 * necessary version upgrades and repairing invalid shapes.
 *
 * The function NEVER throws. If a stored blob is corrupt or
 * unrecognisable, it returns the defaults (or partial-merge of
 * defaults + whatever fields can be salvaged). This is intentional:
 * a corrupt preferences blob must not break the reader app.
 *
 * The function is also intentionally "value-shaped": it operates on
 * `unknown` and returns the validated slice, with no coupling to the
 * reader-store or the preferences store.
 */

import {
  DEFAULT_READER_PREFERENCES,
  PREFERENCES_VERSION,
  readerPreferencesSchema,
  type ReaderPreferences,
} from './schema';

/**
 * Migrate a stored preferences blob to the current schema.
 *
 * Accepts either:
 *  - the bare reader-preference slice (legacy or v1 localStorage), or
 *  - the versioned envelope (cloud), or
 *  - a partial/garbage object — falls back to defaults.
 *
 * Returns an object that satisfies the durable preference slice shape.
 * Field-level errors are silently coerced to defaults so one bad field
 * does not corrupt the entire preferences set.
 */
export function migratePreferences(input: unknown): ReaderPreferences {
  // 1. Try to extract a `reader` slice (the envelope shape).
  let candidate: unknown = input;
  if (
    typeof input === 'object' &&
    input !== null &&
    'reader' in input &&
    typeof (input as { reader: unknown }).reader === 'object'
  ) {
    candidate = (input as { reader: unknown }).reader;
  }

  // 2. Validate against the current schema.
  const parsed = readerPreferencesSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  // 3. Salvage: pick out the valid fields from the candidate and merge
  //    with defaults. Field-by-field so a single bad value doesn't blow
  //    up the whole object.
  const defaults = DEFAULT_READER_PREFERENCES;
  const safeCandidate =
    typeof candidate === 'object' && candidate !== null
      ? (candidate as Record<string, unknown>)
      : {};

  const result: ReaderPreferences = { ...defaults };

  // theme
  if (
    safeCandidate['theme'] === 'light' ||
    safeCandidate['theme'] === 'sepia' ||
    safeCandidate['theme'] === 'dark'
  ) {
    result.theme = safeCandidate['theme'];
  }
  // fontFamily
  if (typeof safeCandidate['fontFamily'] === 'string' && safeCandidate['fontFamily'].length > 0) {
    result.fontFamily = safeCandidate['fontFamily'];
  }
  // fontSize
  if (
    typeof safeCandidate['fontSize'] === 'number' &&
    safeCandidate['fontSize'] >= 8 &&
    safeCandidate['fontSize'] <= 72
  ) {
    result.fontSize = Math.round(safeCandidate['fontSize']);
  }
  // lineHeight
  if (
    typeof safeCandidate['lineHeight'] === 'number' &&
    safeCandidate['lineHeight'] >= 1 &&
    safeCandidate['lineHeight'] <= 3
  ) {
    result.lineHeight = safeCandidate['lineHeight'];
  }
  // margin
  if (
    typeof safeCandidate['margin'] === 'number' &&
    safeCandidate['margin'] >= 0 &&
    safeCandidate['margin'] <= 80
  ) {
    result.margin = safeCandidate['margin'];
  }
  // textAlign
  if (safeCandidate['textAlign'] === 'start' || safeCandidate['textAlign'] === 'justify') {
    result.textAlign = safeCandidate['textAlign'];
  }

  return result;
}

// Re-export for convenience.
export { PREFERENCES_VERSION };
