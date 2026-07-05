/**
 * Cache-wiring tests for Phase 8 per-user library queries (ISD §8.Z — CRITICAL).
 *
 * These tests assert what the tag-helper string tests cannot: that the actual
 * `getMyLibrary`/`getProgressMap` queries wire `userId` into BOTH the
 * `unstable_cache` key parts AND the cache tags. If the tag omits `userId`, the
 * per-user `revalidateTag(userLibraryTag(userId))` emitted by add/remove is a
 * no-op (stale libraries) and per-user isolation is only implicit — the exact
 * defect this suite guards against.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Capture every unstable_cache(fn, keyParts, options) invocation.
const { cacheCalls } = vi.hoisted(() => ({
  cacheCalls: [] as Array<{ keyParts: unknown[]; tags: string[] }>,
}));

vi.mock('next/cache', () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    keyParts: unknown[],
    options?: { tags?: string[] },
  ) => {
    cacheCalls.push({ keyParts, tags: options?.tags ?? [] });
    return (...args: unknown[]) => fn(...args);
  },
}));

// Chainable, awaitable Supabase query stub — every builder method returns the
// same thenable that resolves to an empty result set.
function makeQueryStub() {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  q.select = chain;
  q.eq = chain;
  q.order = chain;
  q.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: [], error: null });
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => makeQueryStub() }),
}));

import { getMyLibrary, getProgressMap } from '@/features/library/queries';
import { userLibraryTag, progressTag } from '@/features/library/cache';

describe('per-user cache wiring (ISD §8.Z)', () => {
  it('getMyLibrary tags the cache with the caller-specific library tag', async () => {
    cacheCalls.length = 0;
    const userId = 'user-aaa';

    await getMyLibrary(userId);

    expect(cacheCalls).toHaveLength(1);
    const call = cacheCalls[0]!;
    // userId must be in the key (isolation) ...
    expect(call.keyParts).toContain(userId);
    // ... and in the tag (so revalidateTag(userLibraryTag(userId)) actually hits).
    expect(call.tags).toContain(userLibraryTag(userId));
  });

  it('getProgressMap tags the cache with the caller-specific progress tag', async () => {
    cacheCalls.length = 0;
    const userId = 'user-bbb';

    await getProgressMap(userId);

    expect(cacheCalls).toHaveLength(1);
    const call = cacheCalls[0]!;
    expect(call.keyParts).toContain(userId);
    expect(call.tags).toContain(progressTag(userId));
  });

  it('different users never share a library cache tag (no cross-user leakage)', async () => {
    cacheCalls.length = 0;
    await getMyLibrary('user-1');
    await getMyLibrary('user-2');

    const first = cacheCalls[0]!;
    const second = cacheCalls[1]!;
    expect(first.tags).not.toEqual(second.tags);
    expect(first.keyParts).not.toEqual(second.keyParts);
  });
});
