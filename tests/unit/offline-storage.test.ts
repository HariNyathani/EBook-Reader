/**
 * Unit tests for Phase 13 storage policy (ISD §13.G, §13.Y, §13.DD #6).
 *
 * Guarantees under test:
 *   - sortByLeastRecentlyRead orders ascending by lastReadAt
 *   - evictLru evicts oldest first until the requested bytes are freed
 *   - the caller is responsible for excluding the currently-open book
 *     (storage is a pure policy)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock('idb-keyval', () => ({
  get: async (k: string) => store.get(k),
  set: async (k: string, v: unknown) => {
    store.set(k, v);
  },
  keys: async () => [...store.keys()],
  del: async (k: string) => {
    store.delete(k);
  },
}));

import { sortByLeastRecentlyRead, evictLru } from '@/features/offline/storage';
import { storeOfflineBook, type OfflineBookRecord } from '@/features/offline/book-store';

function makeBlob(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: 'application/epub+zip' });
}

describe('offline-storage — sortByLeastRecentlyRead', () => {
  it('orders records ascending by lastReadAt', () => {
    const records = [
      { bookId: 'b1', sizeBytes: 10, lastReadAt: '2024-01-03T00:00:00.000Z' },
      { bookId: 'b2', sizeBytes: 20, lastReadAt: '2024-01-01T00:00:00.000Z' },
      { bookId: 'b3', sizeBytes: 30, lastReadAt: '2024-01-02T00:00:00.000Z' },
    ];
    const sorted = sortByLeastRecentlyRead(records);
    expect(sorted.map((r) => r.bookId)).toEqual(['b2', 'b3', 'b1']);
  });

  it('does not mutate the input', () => {
    const records = [
      { bookId: 'b1', sizeBytes: 10, lastReadAt: '2024-01-02T00:00:00.000Z' },
      { bookId: 'b2', sizeBytes: 20, lastReadAt: '2024-01-01T00:00:00.000Z' },
    ];
    const snapshot = records.map((r) => r.bookId);
    sortByLeastRecentlyRead(records);
    expect(records.map((r) => r.bookId)).toEqual(snapshot);
  });
});

describe('offline-storage — evictLru (ISD §13.DD #6)', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('evicts least-recently-read until bytes freed meets the target', async () => {
    // Set up three books with different lastReadAt + sizes.
    await storeOfflineBook('u1', 'b1', makeBlob(10), {
      title: 'B1',
      author: null,
      sizeBytes: 10,
    });
    // Force older timestamps.
    store.set('offline-book:u1:b1', {
      bookId: 'b1',
      title: 'B1',
      author: null,
      sizeBytes: 10,
      blob: makeBlob(10),
      downloadedAt: '2020-01-01T00:00:00.000Z',
      lastReadAt: '2020-01-01T00:00:00.000Z',
    } satisfies OfflineBookRecord);
    await storeOfflineBook('u1', 'b2', makeBlob(20), {
      title: 'B2',
      author: null,
      sizeBytes: 20,
    });
    store.set('offline-book:u1:b2', {
      bookId: 'b2',
      title: 'B2',
      author: null,
      sizeBytes: 20,
      blob: makeBlob(20),
      downloadedAt: '2020-01-02T00:00:00.000Z',
      lastReadAt: '2020-01-02T00:00:00.000Z',
    } satisfies OfflineBookRecord);
    await storeOfflineBook('u1', 'b3', makeBlob(30), {
      title: 'B3',
      author: null,
      sizeBytes: 30,
    });
    store.set('offline-book:u1:b3', {
      bookId: 'b3',
      title: 'B3',
      author: null,
      sizeBytes: 30,
      blob: makeBlob(30),
      downloadedAt: '2020-01-03T00:00:00.000Z',
      lastReadAt: '2020-01-03T00:00:00.000Z',
    } satisfies OfflineBookRecord);

    // Caller is the UI; it must pass the metadata of the books that are
    // safe to evict (i.e. excluding the currently-open book). The policy
    // itself never knows which book is open.
    const meta = [
      { bookId: 'b1', sizeBytes: 10, lastReadAt: '2020-01-01T00:00:00.000Z' },
      { bookId: 'b2', sizeBytes: 20, lastReadAt: '2020-01-02T00:00:00.000Z' },
      { bookId: 'b3', sizeBytes: 30, lastReadAt: '2020-01-03T00:00:00.000Z' },
    ];

    const freed = await evictLru('u1', 25, meta);
    expect(freed).toBe(30); // b1 (10) + b2 (20) = 30
    // b1 + b2 are gone; b3 (currently-open in the caller’s view) survives.
    expect(store.has('offline-book:u1:b1')).toBe(false);
    expect(store.has('offline-book:u1:b2')).toBe(false);
    expect(store.has('offline-book:u1:b3')).toBe(true);
  });

  it('is a no-op when no eviction is required', async () => {
    const meta = [{ bookId: 'b1', sizeBytes: 10, lastReadAt: '2024-01-01T00:00:00.000Z' }];
    const freed = await evictLru('u1', 0, meta);
    expect(freed).toBe(0);
  });
});
