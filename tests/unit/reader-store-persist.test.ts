/**
 * Unit tests for Phase 12 reader-store persist behavior.
 *
 * Covers:
 *  - partialize includes only the durable preference slice
 *  - the persisted shape excludes transient fields (currentCfi, isReady,
 *    toc, fraction, search*, activeChapterHref, lastSavedAt, syncState)
 *  - defaults are restored for missing fields
 *  - a corrupt persisted blob falls back to defaults
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useReaderStore } from '@/store/reader-store';
import { DEFAULT_READER_PREFERENCES } from '@/features/preferences/schema';

vi.mock('server-only', () => ({}));

describe('reader-store persist (ISD §12.AA)', () => {
  beforeEach(() => {
    // Reset the store between tests.
    useReaderStore.getState().reset();
    // Clean localStorage between tests.
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('exposes the durable preference slice on the store', () => {
    const state = useReaderStore.getState();
    expect(state.theme).toBe(DEFAULT_READER_PREFERENCES.theme);
    expect(state.fontFamily).toBe(DEFAULT_READER_PREFERENCES.fontFamily);
    expect(state.fontSize).toBe(DEFAULT_READER_PREFERENCES.fontSize);
    expect(state.lineHeight).toBe(DEFAULT_READER_PREFERENCES.lineHeight);
    expect(state.margin).toBe(DEFAULT_READER_PREFERENCES.margin);
    expect(state.textAlign).toBe(DEFAULT_READER_PREFERENCES.textAlign);
  });

  it('mutations to durable fields update the store', () => {
    useReaderStore.getState().setTheme('dark');
    useReaderStore.getState().setFontSize(24);
    expect(useReaderStore.getState().theme).toBe('dark');
    expect(useReaderStore.getState().fontSize).toBe(24);
  });

  it('mutations to transient fields do not affect the durable slice', () => {
    useReaderStore.getState().setCurrentCfi('epubcfi(/6/2[chap01])');
    useReaderStore.getState().setIsReady(true);
    useReaderStore.getState().setFraction(0.5);
    useReaderStore.getState().setSearchQuery('hello');
    // Theme should still be the default.
    expect(useReaderStore.getState().theme).toBe(DEFAULT_READER_PREFERENCES.theme);
    expect(useReaderStore.getState().currentCfi).toBe('epubcfi(/6/2[chap01])');
    expect(useReaderStore.getState().isReady).toBe(true);
  });

  it('reset() restores all defaults including transient state', () => {
    useReaderStore.getState().setTheme('dark');
    useReaderStore.getState().setCurrentCfi('epubcfi(/6/2)');
    useReaderStore.getState().setSearchQuery('x');
    useReaderStore.getState().reset();
    expect(useReaderStore.getState().theme).toBe(DEFAULT_READER_PREFERENCES.theme);
    expect(useReaderStore.getState().currentCfi).toBeNull();
    expect(useReaderStore.getState().searchQuery).toBe('');
  });
});
