/**
 * Unit tests for Phase 12 savePreferencesAction LWW semantics.
 *
 * Validates:
 *  - Newer incoming update wins
 *  - Older incoming update is a no-op (returns the existing server timestamp)
 *  - Unapproved users get an error result
 *  - Invalid envelopes are rejected
 *  - Server `now()` may be used as the effective storedAt on insert
 *
 * The test mocks the `createClient` server client to return a sequence
 * of "row" snapshots and a sequence of update/insert responses, so we
 * can exercise the conditional-upsert logic without a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResult } from '@/lib/result';

// -----------------------------------------------------------------------------
// Hoisted mocks
// -----------------------------------------------------------------------------

// The server-only module must not blow up under vitest.
vi.mock('server-only', () => ({}));

// We mock the Supabase server client so we can drive the LWW branches
// without a real connection. Each test sets the desired sequence of
// `select -> insert/update` outcomes via the mutable `state` object.
const state = vi.hoisted(() => ({
  approvedUser: true,
  existingRow: null as null | { updated_at: string },
  failOn: null as 'select' | 'insert' | 'update' | null,
  lastInsertPayload: null as unknown,
  lastUpdatePayload: null as unknown,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (state.failOn === 'select') {
              return { data: null, error: { code: 'X', message: 'fail' } };
            }
            return {
              data: state.existingRow,
              error: state.existingRow === null ? { code: 'PGRST116' } : null,
            };
          },
        }),
      }),
      insert: (payload: unknown) => {
        state.lastInsertPayload = payload;
        return {
          select: () => ({
            single: async () => {
              if (state.failOn === 'insert') {
                return { data: null, error: { message: 'insert fail' } };
              }
              const ts = new Date().toISOString();
              state.existingRow = { updated_at: ts };
              return { data: { updated_at: ts }, error: null };
            },
          }),
        };
      },
      update: (payload: unknown) => {
        state.lastUpdatePayload = payload;
        return {
          eq: () => ({
            select: () => ({
              single: async () => {
                if (state.failOn === 'update') {
                  return { data: null, error: { message: 'update fail' } };
                }
                const ts = new Date().toISOString();
                state.existingRow = { updated_at: ts };
                return { data: { updated_at: ts }, error: null };
              },
            }),
          }),
        };
      },
    }),
  }),
}));

vi.mock('@/features/auth/session', () => ({
  requireApproved: async () => {
    if (!state.approvedUser) {
      const err = new Error('not approved');
      throw err;
    }
    return { userId: 'u1', isApproved: true, isAdmin: false };
  },
}));

import { savePreferencesAction } from '@/features/preferences/actions';
import { DEFAULT_READER_PREFERENCES } from '@/features/preferences/schema';

const SAMPLE_READER = {
  theme: 'dark' as const,
  fontFamily: 'Verdana, sans-serif',
  fontSize: 22,
  lineHeight: 1.6,
  margin: 15,
  textAlign: 'start' as const,
};

const SAMPLE_ENVELOPE = { version: 1, reader: SAMPLE_READER };

beforeEach(() => {
  state.approvedUser = true;
  state.existingRow = null;
  state.failOn = null;
  state.lastInsertPayload = null;
  state.lastUpdatePayload = null;
});

describe('savePreferencesAction (ISD §12.S, §12.U)', () => {
  it('rejects unapproved users with an error result (does not throw)', async () => {
    state.approvedUser = false;
    const result = (await savePreferencesAction({
      preferences: SAMPLE_ENVELOPE,
      updatedAt: new Date().toISOString(),
    })) as ActionResult<{ storedAt: string }>;
    expect(result.status).toBe('error');
  });

  it('rejects invalid envelopes', async () => {
    const result = (await savePreferencesAction({
      preferences: { version: 1, reader: { theme: 'magenta' } },
      updatedAt: new Date().toISOString(),
    })) as ActionResult<{ storedAt: string }>;
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('INVALID_INPUT');
    }
  });

  it('rejects an invalid updatedAt', async () => {
    const result = (await savePreferencesAction({
      preferences: SAMPLE_ENVELOPE,
      updatedAt: 'not-a-date',
    })) as ActionResult<{ storedAt: string }>;
    expect(result.status).toBe('error');
  });

  it('inserts when no existing row', async () => {
    const incoming = new Date().toISOString();
    const result = (await savePreferencesAction({
      preferences: SAMPLE_ENVELOPE,
      updatedAt: incoming,
    })) as ActionResult<{ storedAt: string }>;
    expect(result.status).toBe('success');
    expect(state.lastInsertPayload).not.toBeNull();
    expect(state.lastUpdatePayload).toBeNull();
  });

  it('updates when incoming is newer than existing', async () => {
    state.existingRow = { updated_at: new Date(Date.now() - 10000).toISOString() };
    const incoming = new Date().toISOString();
    const result = (await savePreferencesAction({
      preferences: SAMPLE_ENVELOPE,
      updatedAt: incoming,
    })) as ActionResult<{ storedAt: string }>;
    expect(result.status).toBe('success');
    expect(state.lastUpdatePayload).not.toBeNull();
    expect(state.lastInsertPayload).toBeNull();
  });

  it('is a no-op when incoming is older than existing (returns existing timestamp)', async () => {
    const existingTs = new Date(Date.now() + 10000).toISOString();
    state.existingRow = { updated_at: existingTs };
    const incoming = new Date(Date.now() - 10000).toISOString();
    const result = (await savePreferencesAction({
      preferences: SAMPLE_ENVELOPE,
      updatedAt: incoming,
    })) as ActionResult<{ storedAt: string }>;
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      // The effective storedAt is the existing newer timestamp, not the incoming one.
      expect(result.data?.storedAt).toBe(existingTs);
    }
    expect(state.lastUpdatePayload).toBeNull();
    expect(state.lastInsertPayload).toBeNull();
  });

  it('accepts the default envelope', async () => {
    const result = (await savePreferencesAction({
      preferences: { version: 1, reader: DEFAULT_READER_PREFERENCES },
      updatedAt: new Date().toISOString(),
    })) as ActionResult<{ storedAt: string }>;
    expect(result.status).toBe('success');
  });
});
