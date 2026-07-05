/**
 * Versioned reader preferences schema (ISD §12.I, §12.R).
 *
 * Single source of truth for the shape of the durable preference slice.
 * Used by:
 *   - reader-store (persistence slice)
 *   - savePreferencesAction (server validation)
 *   - getPreferences (server read & validation)
 *   - migrate (forward-compatible upgrades)
 *
 * Schema is versioned via `PREFERENCES_VERSION`. Future versions add new
 * fields (or namespaces) and bump the version; the `migrate` function
 * upgrades older shapes transparently.
 *
 * Reserved namespaces (highlights, annotations, dictionary) are
 * documented but NOT implemented in this phase (SAD §7 future work).
 */

import { z } from 'zod';

export const PREFERENCES_VERSION = 1;

/**
 * Reader typography + theme preferences.
 * The fields here map 1:1 to the durable slice in `reader-store`.
 */
export const readerPreferencesSchema = z.object({
  theme: z.enum(['light', 'sepia', 'dark']),
  fontFamily: z.string().min(1).max(500),
  fontSize: z.number().int().min(8).max(72),
  lineHeight: z.number().min(1).max(3),
  margin: z.number().min(0).max(80),
  textAlign: z.enum(['start', 'justify']),
});

export type ReaderPreferences = z.infer<typeof readerPreferencesSchema>;

/**
 * Full preferences envelope.
 *
 * Reserved namespaces (`highlights`, `annotations`, `dictionary`) are
 * optional in the schema so older blobs still validate; they are NOT
 * implemented in this phase but the jsonb column reserves the space.
 */
export const preferencesSchema = z.object({
  version: z.number().int().min(1),
  reader: readerPreferencesSchema,
  // Reserved for SAD §7 future features — optional, any shape.
  highlights: z.unknown().optional(),
  annotations: z.unknown().optional(),
  dictionary: z.unknown().optional(),
});

export type Preferences = z.infer<typeof preferencesSchema>;

/**
 * Default reader preferences.
 * Mirrors the defaults in `reader-store.DEFAULT_STATE` (durable slice).
 */
export const DEFAULT_READER_PREFERENCES: ReaderPreferences = Object.freeze({
  theme: 'light',
  fontFamily: 'Georgia, serif',
  fontSize: 18,
  lineHeight: 1.5,
  margin: 20,
  textAlign: 'start',
});

/**
 * Default envelope (version 1).
 */
export const DEFAULT_PREFERENCES: Preferences = Object.freeze({
  version: PREFERENCES_VERSION,
  reader: DEFAULT_READER_PREFERENCES,
});
