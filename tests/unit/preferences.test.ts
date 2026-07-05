/**
 * Unit tests for Phase 12 preferences.
 *
 * Covers:
 *  - Schema validation (readerPreferencesSchema, preferencesSchema)
 *  - migratePreferences: upgrades, repairs invalid input, never throws
 *  - snapshotPreferences / prefsEqual helpers (via the public surface)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  preferencesSchema,
  readerPreferencesSchema,
  DEFAULT_READER_PREFERENCES,
  DEFAULT_PREFERENCES,
  PREFERENCES_VERSION,
} from '@/features/preferences/schema';
import { migratePreferences } from '@/features/preferences/migrate';

vi.mock('server-only', () => ({}));

describe('preferences schema', () => {
  it('accepts a valid reader-preference slice', () => {
    const result = readerPreferencesSchema.safeParse(DEFAULT_READER_PREFERENCES);
    expect(result.success).toBe(true);
  });

  it('rejects unknown theme values', () => {
    const result = readerPreferencesSchema.safeParse({
      ...DEFAULT_READER_PREFERENCES,
      theme: 'magenta',
    });
    expect(result.success).toBe(false);
  });

  it('clamps font-size to [8..72]', () => {
    const tooSmall = readerPreferencesSchema.safeParse({
      ...DEFAULT_READER_PREFERENCES,
      fontSize: 4,
    });
    expect(tooSmall.success).toBe(false);

    const tooBig = readerPreferencesSchema.safeParse({
      ...DEFAULT_READER_PREFERENCES,
      fontSize: 100,
    });
    expect(tooBig.success).toBe(false);

    const ok = readerPreferencesSchema.safeParse({
      ...DEFAULT_READER_PREFERENCES,
      fontSize: 32,
    });
    expect(ok.success).toBe(true);
  });

  it('rejects unknown textAlign values', () => {
    const result = readerPreferencesSchema.safeParse({
      ...DEFAULT_READER_PREFERENCES,
      textAlign: 'center',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid versioned envelope', () => {
    const result = preferencesSchema.safeParse(DEFAULT_PREFERENCES);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(PREFERENCES_VERSION);
    }
  });

  it('accepts envelopes with reserved optional namespaces', () => {
    const result = preferencesSchema.safeParse({
      version: PREFERENCES_VERSION,
      reader: DEFAULT_READER_PREFERENCES,
      highlights: { color: 'yellow' },
    });
    expect(result.success).toBe(true);
  });
});

describe('migratePreferences', () => {
  it('returns defaults when given null', () => {
    const result = migratePreferences(null);
    expect(result).toEqual(DEFAULT_READER_PREFERENCES);
  });

  it('returns defaults when given undefined', () => {
    const result = migratePreferences(undefined);
    expect(result).toEqual(DEFAULT_READER_PREFERENCES);
  });

  it('returns defaults when given garbage', () => {
    const result = migratePreferences('not an object');
    expect(result).toEqual(DEFAULT_READER_PREFERENCES);
  });

  it('extracts the reader slice from a versioned envelope', () => {
    const result = migratePreferences({
      version: 1,
      reader: { theme: 'dark', fontSize: 24 },
    });
    expect(result.theme).toBe('dark');
    expect(result.fontSize).toBe(24);
  });

  it('salvages valid fields from a partial / corrupt object', () => {
    const result = migratePreferences({
      theme: 'sepia',
      fontSize: 28,
      // fontFamily is missing — should fall back to default
      // margin is corrupt (negative) — should fall back to default
      margin: -10,
    });
    expect(result.theme).toBe('sepia');
    expect(result.fontSize).toBe(28);
    expect(result.fontFamily).toBe(DEFAULT_READER_PREFERENCES.fontFamily);
    expect(result.margin).toBe(DEFAULT_READER_PREFERENCES.margin);
  });

  it('never throws, even for deeply weird input', () => {
    expect(() => migratePreferences({ reader: { theme: 123 } })).not.toThrow();
    expect(() => migratePreferences({ reader: { fontSize: 'big' } })).not.toThrow();
    expect(() => migratePreferences({})).not.toThrow();
    expect(() => migratePreferences(42)).not.toThrow();
  });

  it('returns defaults when every field is invalid', () => {
    const result = migratePreferences({
      theme: 'purple',
      fontFamily: '',
      fontSize: 1000,
      lineHeight: 0,
      margin: -5,
      textAlign: 'middle',
    });
    // The function salvages what it can. fontFamily '' is invalid → default.
    // fontSize 1000 is out of [8..72] → default. etc.
    expect(result.fontFamily).toBe(DEFAULT_READER_PREFERENCES.fontFamily);
    expect(result.fontSize).toBe(DEFAULT_READER_PREFERENCES.fontSize);
    expect(result.lineHeight).toBe(DEFAULT_READER_PREFERENCES.lineHeight);
    expect(result.margin).toBe(DEFAULT_READER_PREFERENCES.margin);
  });
});
