/**
 * Unit tests for Phase 10 multi-device conditional upsert (ISD §10.F).
 *
 * The multi-device conflict resolution is the most safety-critical piece of
 * Phase 10: a delayed offline flush must NOT clobber a newer position saved
 * from another device. These tests pin the timestamp semantics:
 *   - no existing row              → insert
 *   - incoming updatedAt >  stored → update (overwrite)
 *   - incoming updatedAt == stored → update (idempotent re-write)
 *   - incoming updatedAt <  stored → NO-OP (return existing newer row)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// server-only guard must be neutralized in the test environment.
vi.mock('server-only', () => ({}));

// Mock the request-scoped Supabase client factory.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { persistProgress } from '@/features/reader/progress/persist-progress';

/**
 * Build a chainable Supabase mock that emulates the two code paths in
 * persistProgress: an initial `select(...).maybeSingle()` read, followed by
 * either `insert(...).select().single()` or `update(...).select().single()`.
 */
function makeSupabaseMock(opts: {
  existing: unknown;
  selectError?: { code?: string; message: string } | null;
  writeResult?: unknown;
  writeError?: { message: string } | null;
}) {
  const state = { mode: 'select' as 'select' | 'insert' | 'update' };
  const captured: { insert?: unknown; update?: unknown } = {};

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    insert: vi.fn((payload: unknown) => {
      state.mode = 'insert';
      captured.insert = payload;
      return chain;
    }),
    update: vi.fn((payload: unknown) => {
      state.mode = 'update';
      captured.update = payload;
      return chain;
    }),
    maybeSingle: vi.fn(async () => ({
      data: opts.existing,
      error: opts.selectError ?? null,
    })),
    single: vi.fn(async () => ({
      data: opts.writeResult ?? null,
      error: opts.writeError ?? null,
    })),
  };

  const supabase = { from: vi.fn(() => chain) };
  vi.mocked(createClient).mockResolvedValue(supabase as never);
  return { supabase, chain, captured, state };
}

const OLDER = '2026-07-05T10:00:00.000Z';
const NEWER = '2026-07-05T12:00:00.000Z';

describe('persistProgress — conditional upsert (ISD §10.F)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts when no row exists', async () => {
    const inserted = {
      id: 'p1',
      user_id: 'u1',
      book_id: 'b1',
      cfi: 'epubcfi(/6/2)',
      percentage: 10,
      updated_at: NEWER,
    };
    const { chain, captured } = makeSupabaseMock({
      existing: null,
      writeResult: inserted,
    });

    const result = await persistProgress('u1', 'b1', 'epubcfi(/6/2)', 10, NEWER);

    expect(chain.insert).toHaveBeenCalledTimes(1);
    expect(chain.update).not.toHaveBeenCalled();
    expect(captured.insert).toMatchObject({
      user_id: 'u1',
      book_id: 'b1',
      cfi: 'epubcfi(/6/2)',
      percentage: 10,
      updated_at: NEWER,
    });
    expect(result.updated_at).toBe(NEWER);
  });

  it('overwrites when incoming updatedAt is NEWER than stored', async () => {
    const existing = {
      id: 'p1',
      user_id: 'u1',
      book_id: 'b1',
      cfi: 'old',
      percentage: 20,
      updated_at: OLDER,
    };
    const updated = { ...existing, cfi: 'new', percentage: 40, updated_at: NEWER };
    const { chain, captured } = makeSupabaseMock({
      existing,
      writeResult: updated,
    });

    const result = await persistProgress('u1', 'b1', 'new', 40, NEWER);

    expect(chain.update).toHaveBeenCalledTimes(1);
    expect(chain.insert).not.toHaveBeenCalled();
    expect(captured.update).toMatchObject({ cfi: 'new', percentage: 40, updated_at: NEWER });
    expect(result.cfi).toBe('new');
    expect(result.updated_at).toBe(NEWER);
  });

  it('overwrites when incoming updatedAt EQUALS stored (>= semantics)', async () => {
    const existing = {
      id: 'p1',
      user_id: 'u1',
      book_id: 'b1',
      cfi: 'a',
      percentage: 50,
      updated_at: NEWER,
    };
    const updated = { ...existing, cfi: 'b', percentage: 55 };
    const { chain } = makeSupabaseMock({ existing, writeResult: updated });

    const result = await persistProgress('u1', 'b1', 'b', 55, NEWER);

    expect(chain.update).toHaveBeenCalledTimes(1);
    expect(result.cfi).toBe('b');
  });

  it('NO-OPs (does not write) when incoming updatedAt is OLDER than stored — multi-device safety', async () => {
    const existing = {
      id: 'p1',
      user_id: 'u1',
      book_id: 'b1',
      cfi: 'device-B-newer',
      percentage: 80,
      updated_at: NEWER,
    };
    const { chain, captured } = makeSupabaseMock({ existing });

    // A stale offline flush arrives with an OLDER timestamp.
    const result = await persistProgress('u1', 'b1', 'device-A-stale', 30, OLDER);

    // Critical: neither insert nor update may run — the newer position survives.
    expect(chain.insert).not.toHaveBeenCalled();
    expect(chain.update).not.toHaveBeenCalled();
    expect(captured.update).toBeUndefined();

    // Returns the existing (newer) row so the client can reconcile.
    expect(result.cfi).toBe('device-B-newer');
    expect(result.updated_at).toBe(NEWER);
  });

  it('throws when the initial select fails with a non-PGRST116 error', async () => {
    makeSupabaseMock({
      existing: null,
      selectError: { code: 'XX000', message: 'connection reset' },
    });

    await expect(
      persistProgress('u1', 'b1', 'cfi', 10, NEWER),
    ).rejects.toThrow(/connection reset/);
  });
});
