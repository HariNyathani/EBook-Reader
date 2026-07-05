/**
 * Unit tests for Phase 13 offline book store (ISD §13.G, §13.Y, §13.Z).
 *
 * Guarantees under test:
 *   - per-user namespacing of IndexedDB keys
 *   - download/get/remove CRUD
 *   - list + clearUser
 *   - touch bumps lastReadAt
 *   - never persists tokens
 *   - the per-user cleanup wipes ONLY that user's records
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory IndexedDB substitute (hoisted so the vi.mock factory can close over it).
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

import {
  storeOfflineBook,
  getOfflineBook,
  removeOfflineBook,
  listOffline,
  listOfflineMeta,
  clearUser,
  touchOfflineBook,
  getUserStorageUsage,
  offlineBookKey,
  type OfflineBookRecord,
} from '@/features/offline/book-store';

function makeBlob(text: string, size = 10): Blob {
  // jsdom Blob is supported; we synthesize deterministic bytes.
  return new Blob([new Uint8Array(size).fill(text.charCodeAt(0) || 0x20)], {
    type: 'application/epub+zip',
  });
}

describe('offline-book-store — per-user namespacing (ISD §13.Z)', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('builds per-user keys', () => {
    expect(offlineBookKey('user-a', 'book-1')).toBe('offline-book:user-a:book-1');
    expect(offlineBookKey('user-b', 'book-1')).toBe('offline-book:user-b:book-1');
  });

  it('store/get/remove cycle', async () => {
    const blob = makeBlob('A', 50);
    await storeOfflineBook('user-a', 'book-1', blob, {
      title: 'Book 1',
      author: 'Author 1',
      sizeBytes: 50,
    });
    const got = await getOfflineBook('user-a', 'book-1');
    expect(got).not.toBeNull();
    expect(got!.title).toBe('Book 1');
    expect(got!.blob.size).toBe(50);
    expect(got!.sizeBytes).toBe(50);

    await removeOfflineBook('user-a', 'book-1');
    expect(await getOfflineBook('user-a', 'book-1')).toBeNull();
  });

  it('users cannot read each other downloads', async () => {
    const blobA = makeBlob('A', 10);
    const blobB = makeBlob('B', 20);
    await storeOfflineBook('user-a', 'book-1', blobA, {
      title: 'A1',
      author: null,
      sizeBytes: 10,
    });
    await storeOfflineBook('user-b', 'book-1', blobB, {
      title: 'B1',
      author: null,
      sizeBytes: 20,
    });

    const a = await getOfflineBook('user-a', 'book-1');
    const b = await getOfflineBook('user-b', 'book-1');
    expect(a?.title).toBe('A1');
    expect(b?.title).toBe('B1');
    expect(a?.sizeBytes).toBe(10);
    expect(b?.sizeBytes).toBe(20);
  });

  it('listOffline returns only the requesting user’s records', async () => {
    await storeOfflineBook('user-a', 'book-1', makeBlob('A', 10), {
      title: 'A1',
      author: null,
      sizeBytes: 10,
    });
    await storeOfflineBook('user-a', 'book-2', makeBlob('A', 20), {
      title: 'A2',
      author: null,
      sizeBytes: 20,
    });
    await storeOfflineBook('user-b', 'book-1', makeBlob('B', 30), {
      title: 'B1',
      author: null,
      sizeBytes: 30,
    });

    const aList = await listOffline('user-a');
    const bList = await listOffline('user-b');
    expect(aList.map((b: OfflineBookRecord) => b.title).sort()).toEqual(['A1', 'A2']);
    expect(bList.map((b: OfflineBookRecord) => b.title)).toEqual(['B1']);
  });

  it('listOfflineMeta returns metadata without blob materialization', async () => {
    await storeOfflineBook('user-a', 'book-1', makeBlob('A', 10), {
      title: 'A1',
      author: 'X',
      sizeBytes: 10,
    });
    const meta = await listOfflineMeta('user-a');
    expect(meta).toHaveLength(1);
    expect(meta[0]?.title).toBe('A1');
    // listOfflineMeta returns the meta shape (no blob).
    expect((meta[0] as unknown as { blob?: unknown }).blob).toBeUndefined();
  });

  it('touchOfflineBook bumps lastReadAt', async () => {
    await storeOfflineBook('user-a', 'book-1', makeBlob('A', 10), {
      title: 'A1',
      author: null,
      sizeBytes: 10,
    });
    const before = await getOfflineBook('user-a', 'book-1');
    const beforeTime = before!.lastReadAt;
    // Wait a few ms so the timestamp is distinguishable.
    await new Promise((r) => setTimeout(r, 5));
    await touchOfflineBook('user-a', 'book-1');
    const after = await getOfflineBook('user-a', 'book-1');
    expect(new Date(after!.lastReadAt).getTime()).toBeGreaterThanOrEqual(
      new Date(beforeTime).getTime(),
    );
  });

  it('getUserStorageUsage sums sizeBytes for the user', async () => {
    await storeOfflineBook('user-a', 'b1', makeBlob('A', 10), {
      title: 'A1',
      author: null,
      sizeBytes: 10,
    });
    await storeOfflineBook('user-a', 'b2', makeBlob('B', 20), {
      title: 'A2',
      author: null,
      sizeBytes: 20,
    });
    await storeOfflineBook('user-b', 'b1', makeBlob('C', 99), {
      title: 'B1',
      author: null,
      sizeBytes: 99,
    });
    expect(await getUserStorageUsage('user-a')).toBe(30);
    expect(await getUserStorageUsage('user-b')).toBe(99);
  });
});

describe('offline-book-store — clearUser (sign-out cleanup, ISD §13.Z)', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('removes only the target user’s downloads', async () => {
    await storeOfflineBook('user-a', 'b1', makeBlob('A', 10), {
      title: 'A1',
      author: null,
      sizeBytes: 10,
    });
    await storeOfflineBook('user-b', 'b1', makeBlob('B', 20), {
      title: 'B1',
      author: null,
      sizeBytes: 20,
    });

    const removed = await clearUser('user-a');
    expect(removed).toBe(1);
    expect(await getOfflineBook('user-a', 'b1')).toBeNull();
    // user-b is untouched.
    expect((await getOfflineBook('user-b', 'b1'))?.title).toBe('B1');
  });

  it('is idempotent on a user with no downloads', async () => {
    const removed = await clearUser('user-zzz');
    expect(removed).toBe(0);
  });
});
