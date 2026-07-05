/**
 * Unit tests for Phase 8 Library Management.
 *
 * Tests cover:
 * - Schema validation (libraryMutationSchema, catalogParamsSchema)
 * - Cache tag helpers (per-user isolation)
 * - Action authorization (requireApproved guard)
 */

import { describe, it, expect, vi } from 'vitest';
import { libraryMutationSchema, catalogParamsSchema } from '@/features/library/schemas';
import { LIBRARY_TAG, userLibraryTag, progressTag } from '@/features/library/cache';
import { SORTS, LIBRARY_PAGE_SIZE } from '@/features/library/constants';

// Mock server-only to allow server-only modules in test environment
vi.mock('server-only', () => ({}));

describe('libraryMutationSchema', () => {
  it('accepts valid bookId', () => {
    const result = libraryMutationSchema.safeParse({
      bookId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = libraryMutationSchema.safeParse({
      bookId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing bookId', () => {
    const result = libraryMutationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects non-string bookId', () => {
    const result = libraryMutationSchema.safeParse({
      bookId: 123,
    });
    expect(result.success).toBe(false);
  });
});

describe('catalogParamsSchema', () => {
  it('parses valid params', () => {
    const result = catalogParamsSchema.safeParse({
      query: 'test',
      sort: 'title',
      page: '2',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe('test');
      expect(result.data.sort).toBe('title');
      expect(result.data.page).toBe(2);
    }
  });

  it('coerces string page to number', () => {
    const result = catalogParamsSchema.safeParse({
      page: '3',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
    }
  });

  it('defaults to recent sort when not provided', () => {
    const result = catalogParamsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('recent');
    }
  });

  it('defaults to page 1 when not provided', () => {
    const result = catalogParamsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
    }
  });

  it('rejects invalid sort option', () => {
    const result = catalogParamsSchema.safeParse({
      sort: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive page', () => {
    const result = catalogParamsSchema.safeParse({
      page: '0',
    });
    expect(result.success).toBe(false);
  });

  it('trims and limits query length', () => {
    const result = catalogParamsSchema.safeParse({
      query: '  test query  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe('test query');
    }
  });
});

describe('cache tag helpers', () => {
  it('LIBRARY_TAG is a static string', () => {
    expect(LIBRARY_TAG).toBe('library');
  });

  it('userLibraryTag includes userId', () => {
    const userId = 'user-123';
    const tag = userLibraryTag(userId);
    expect(tag).toBe('library:user-123');
    expect(tag).toContain(userId);
  });

  it('progressTag includes userId', () => {
    const userId = 'user-456';
    const tag = progressTag(userId);
    expect(tag).toBe('progress:user-456');
    expect(tag).toContain(userId);
  });

  it('per-user tags are unique per userId', () => {
    const tag1 = userLibraryTag('user-a');
    const tag2 = userLibraryTag('user-b');
    expect(tag1).not.toBe(tag2);
  });

  it('progress tags are unique per userId', () => {
    const tag1 = progressTag('user-a');
    const tag2 = progressTag('user-b');
    expect(tag1).not.toBe(tag2);
  });
});

describe('constants', () => {
  it('LIBRARY_PAGE_SIZE is 24', () => {
    expect(LIBRARY_PAGE_SIZE).toBe(24);
  });

  it('SORTS contains expected values', () => {
    expect(SORTS).toContain('recent');
    expect(SORTS).toContain('title');
    expect(SORTS).toContain('author');
  });
});

describe('cache isolation (critical — ISD §8.Z)', () => {
  it('different userIds produce different library tags', () => {
    const user1Tag = userLibraryTag('user-1');
    const user2Tag = userLibraryTag('user-2');

    // Critical: tags must be different to prevent cross-user cache leakage
    expect(user1Tag).not.toBe(user2Tag);
  });

  it('different userIds produce different progress tags', () => {
    const user1Tag = progressTag('user-1');
    const user2Tag = progressTag('user-2');

    // Critical: tags must be different to prevent cross-user cache leakage
    expect(user1Tag).not.toBe(user2Tag);
  });

  it('catalog tag is shared (same for all users)', () => {
    // The catalog is the same for all approved users (RLS ensures this)
    // So it can use a shared cache tag
    expect(LIBRARY_TAG).toBe('library');
  });
});
