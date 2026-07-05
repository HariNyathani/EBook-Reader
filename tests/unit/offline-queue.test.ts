/**
 * Unit tests for Phase 10 offline queue (ISD §10.I, Decision D/G).
 *
 * Guarantees under test:
 *   - last-write-wins per bookId (queueProgress overwrites, marks dirty)
 *   - getPending returns only dirty entries
 *   - flushPending clears the dirty flag ONLY on a successful save
 *   - flushPending KEEPS the dirty flag on failure (error result OR thrown) —
 *     so an unsynced position is never lost.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResult } from '@/lib/result';

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

// Mock the Server Action the queue flushes through, so we don't pull the
// server-only persistence chain into jsdom.
const { saveProgressActionMock } = vi.hoisted(() => ({
  saveProgressActionMock: vi.fn<(input: unknown) => Promise<ActionResult<{ storedAt: string }>>>(),
}));
vi.mock('@/features/reader/progress/actions', () => ({
  saveProgressAction: saveProgressActionMock,
}));

import {
  queueProgress,
  getPending,
  flushPending,
  hasPending,
  removeProgress,
  clearAllProgress,
  type PendingProgressEntry,
} from '@/features/reader/progress/offline-queue';

const read = (bookId: string) =>
  store.get(`progress:${bookId}`) as PendingProgressEntry | undefined;

describe('offline-queue — last-write-wins (ISD Decision D)', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('queues a dirty entry keyed by bookId', async () => {
    await queueProgress('b1', { cfi: 'c1', percentage: 10, updatedAt: 't1' });

    const entry = read('b1');
    expect(entry).toMatchObject({ bookId: 'b1', cfi: 'c1', percentage: 10, dirty: true });
  });

  it('overwrites the same book (last-write-wins), keeping one entry', async () => {
    await queueProgress('b1', { cfi: 'first', percentage: 10, updatedAt: 't1' });
    await queueProgress('b1', { cfi: 'second', percentage: 20, updatedAt: 't2' });

    const pending = await getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ cfi: 'second', percentage: 20 });
  });

  it('getPending returns only dirty entries', async () => {
    await queueProgress('b1', { cfi: 'c1', percentage: 10, updatedAt: 't1' });
    // Simulate an already-synced (clean) entry for another book.
    store.set('progress:b2', {
      bookId: 'b2',
      cfi: 'c2',
      percentage: 50,
      updatedAt: 't2',
      dirty: false,
    } satisfies PendingProgressEntry);

    const pending = await getPending();
    expect(pending.map((e) => e.bookId)).toEqual(['b1']);
    expect(await hasPending()).toBe(true);
  });
});

describe('offline-queue — flush semantics (ISD Decision G)', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('clears the dirty flag after a successful save', async () => {
    await queueProgress('b1', { cfi: 'c1', percentage: 10, updatedAt: 't1' });
    saveProgressActionMock.mockResolvedValue({ status: 'success', data: { storedAt: 't1' } });

    await flushPending();

    expect(saveProgressActionMock).toHaveBeenCalledWith({
      bookId: 'b1',
      cfi: 'c1',
      percentage: 10,
      updatedAt: 't1',
    });
    expect(read('b1')?.dirty).toBe(false);
    expect(await hasPending()).toBe(false);
  });

  it('KEEPS the dirty flag when the save returns an error result', async () => {
    await queueProgress('b1', { cfi: 'c1', percentage: 10, updatedAt: 't1' });
    saveProgressActionMock.mockResolvedValue({ status: 'error', message: 'server down' });

    await flushPending();

    expect(read('b1')?.dirty).toBe(true);
    expect(await hasPending()).toBe(true);
  });

  it('KEEPS the dirty flag when the save throws (network error)', async () => {
    await queueProgress('b1', { cfi: 'c1', percentage: 10, updatedAt: 't1' });
    saveProgressActionMock.mockRejectedValue(new Error('network'));

    await flushPending();

    expect(read('b1')?.dirty).toBe(true);
    expect(await hasPending()).toBe(true);
  });

  it('flushes multiple dirty books independently', async () => {
    await queueProgress('b1', { cfi: 'c1', percentage: 10, updatedAt: 't1' });
    await queueProgress('b2', { cfi: 'c2', percentage: 20, updatedAt: 't2' });
    // b1 succeeds, b2 fails.
    saveProgressActionMock.mockImplementation(async (input) => {
      const { bookId } = input as { bookId: string };
      return bookId === 'b1'
        ? { status: 'success', data: { storedAt: 't1' } }
        : { status: 'error', message: 'nope' };
    });

    await flushPending();

    expect(read('b1')?.dirty).toBe(false);
    expect(read('b2')?.dirty).toBe(true);
  });

  it('removeProgress deletes the entry entirely', async () => {
    await queueProgress('b1', { cfi: 'c1', percentage: 10, updatedAt: 't1' });
    await removeProgress('b1');
    expect(read('b1')).toBeUndefined();
  });
});

describe('offline-queue — clearAllProgress (shared-device isolation, ISD §13.Z)', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('purges every queued entry (dirty AND clean) so nothing leaks to the next user', async () => {
    // Simulate leftovers from a signed-out user: one still-dirty (never
    // flushed because they were offline) and one already-synced.
    await queueProgress('b1', { cfi: 'c1', percentage: 10, updatedAt: 't1' });
    store.set('progress:b2', {
      bookId: 'b2',
      cfi: 'c2',
      percentage: 50,
      updatedAt: 't2',
      dirty: false,
    } satisfies PendingProgressEntry);

    const removed = await clearAllProgress();

    expect(removed).toBe(2);
    expect(read('b1')).toBeUndefined();
    expect(read('b2')).toBeUndefined();
    expect(await hasPending()).toBe(false);
  });

  it('leaves unrelated (non-progress) IndexedDB keys untouched', async () => {
    // An offline-book blob for some user must survive — clearAllProgress
    // is scoped to the progress queue only (clearUser handles book bytes).
    store.set('offline-book:user-a:b9', { blob: 'x' });
    await queueProgress('b1', { cfi: 'c1', percentage: 10, updatedAt: 't1' });

    await clearAllProgress();

    expect(store.has('offline-book:user-a:b9')).toBe(true);
    expect(read('b1')).toBeUndefined();
  });
});
