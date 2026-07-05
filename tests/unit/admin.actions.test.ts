/**
 * Unit tests for Phase 5 (admin governance) and Phase 6 (upload) surfaces.
 *
 * Covers the gaps the phase agent left open:
 * - New Zod schemas: adminToggleSchema, uploadMetaSchema, deleteBookSchema.
 * - Admin guard logic: FORBIDDEN (non-admin), SELF_DEMOTE, LAST_ADMIN.
 * - fallbackExtractor / deriveTitleFromFilename (Phase 6 metadata seam).
 *
 * The Server Actions are exercised with mocked auth + service-role clients so
 * the guard branches run without a live Supabase project.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mutable mock state (referenced inside vi.mock factories).
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  claims: { userId: 'admin-1', isApproved: true, isAdmin: true } as {
    userId: string;
    isApproved: boolean;
    isAdmin: boolean;
  },
  requireAdminThrows: null as Error | null,
  adminCount: 2,
  countError: null as { message: string } | null,
  updateError: null as { message: string } | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock('@/features/auth/session', () => ({
  requireAdmin: vi.fn(async () => {
    if (h.requireAdminThrows) throw h.requireAdminThrows;
    return h.claims;
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: h.adminCount, error: h.countError }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: h.updateError }),
      }),
    }),
  }),
}));

// Import after mocks are registered.
import { setUserAdminAction, setUserApprovalAction } from '@/features/admin/actions';
import { adminToggleSchema } from '@/features/admin/schemas';
import { uploadMetaSchema, deleteBookSchema } from '@/features/admin/upload/schemas';
import { deriveTitleFromFilename, fallbackExtractor } from '@/lib/epub/fallback-extractor';

const UUID = '123e4567-e89b-12d3-a456-426614174000';

beforeEach(() => {
  h.claims = { userId: 'admin-1', isApproved: true, isAdmin: true };
  h.requireAdminThrows = null;
  h.adminCount = 2;
  h.countError = null;
  h.updateError = null;
});

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
describe('adminToggleSchema', () => {
  it('accepts a valid UUID + boolean', () => {
    expect(adminToggleSchema.safeParse({ userId: UUID, makeAdmin: true }).success).toBe(true);
    expect(adminToggleSchema.safeParse({ userId: UUID, makeAdmin: false }).success).toBe(true);
  });
  it('rejects a non-UUID userId', () => {
    expect(adminToggleSchema.safeParse({ userId: 'nope', makeAdmin: true }).success).toBe(false);
  });
  it('rejects a non-boolean makeAdmin', () => {
    expect(adminToggleSchema.safeParse({ userId: UUID, makeAdmin: 'yes' }).success).toBe(false);
  });
  it('rejects missing makeAdmin', () => {
    expect(adminToggleSchema.safeParse({ userId: UUID }).success).toBe(false);
  });
});

describe('uploadMetaSchema', () => {
  it('accepts empty input (title/author optional)', () => {
    expect(uploadMetaSchema.safeParse({}).success).toBe(true);
  });
  it('trims whitespace', () => {
    const parsed = uploadMetaSchema.safeParse({ title: '  Dune  ', author: '  Herbert ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe('Dune');
      expect(parsed.data.author).toBe('Herbert');
    }
  });
  it('rejects a title longer than 300 chars', () => {
    expect(uploadMetaSchema.safeParse({ title: 'a'.repeat(301) }).success).toBe(false);
  });
  it('rejects an author longer than 200 chars', () => {
    expect(uploadMetaSchema.safeParse({ author: 'a'.repeat(201) }).success).toBe(false);
  });
});

describe('deleteBookSchema', () => {
  it('accepts a valid UUID bookId', () => {
    expect(deleteBookSchema.safeParse({ bookId: UUID }).success).toBe(true);
  });
  it('rejects a non-UUID bookId', () => {
    expect(deleteBookSchema.safeParse({ bookId: 'not-a-uuid' }).success).toBe(false);
  });
  it('rejects a missing bookId', () => {
    expect(deleteBookSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setUserAdminAction guard logic (ISD §5.W)
// ---------------------------------------------------------------------------
describe('setUserAdminAction guards', () => {
  it('denies a non-admin caller with FORBIDDEN', async () => {
    h.requireAdminThrows = new Error('not admin');
    const res = await setUserAdminAction({ userId: UUID, makeAdmin: true });
    expect(res).toMatchObject({ status: 'error', code: 'FORBIDDEN' });
  });

  it('rejects invalid input with VALIDATION_ERROR', async () => {
    const res = await setUserAdminAction({ userId: 'bad', makeAdmin: true });
    expect(res).toMatchObject({ status: 'error', code: 'VALIDATION_ERROR' });
  });

  it('blocks self-demotion with SELF_DEMOTE', async () => {
    h.claims = { userId: UUID, isApproved: true, isAdmin: true };
    const res = await setUserAdminAction({ userId: UUID, makeAdmin: false });
    expect(res).toMatchObject({ status: 'error', code: 'SELF_DEMOTE' });
  });

  it('blocks demoting the last admin with LAST_ADMIN', async () => {
    h.adminCount = 1; // only one admin remains
    const res = await setUserAdminAction({ userId: UUID, makeAdmin: false });
    expect(res).toMatchObject({ status: 'error', code: 'LAST_ADMIN' });
  });

  it('allows demotion when more than one admin exists', async () => {
    h.adminCount = 2;
    const res = await setUserAdminAction({ userId: UUID, makeAdmin: false });
    expect(res.status).toBe('success');
  });

  it('allows promotion without the last-admin check', async () => {
    h.adminCount = 1; // irrelevant for promotion
    const res = await setUserAdminAction({ userId: UUID, makeAdmin: true });
    expect(res.status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// setUserApprovalAction guard logic
// ---------------------------------------------------------------------------
describe('setUserApprovalAction guards', () => {
  it('blocks an admin from revoking their own approval', async () => {
    h.claims = { userId: UUID, isApproved: true, isAdmin: true };
    const res = await setUserApprovalAction({ userId: UUID, approve: false });
    expect(res).toMatchObject({ status: 'error', code: 'SELF_DEMOTE' });
  });

  it('allows approving another user', async () => {
    const res = await setUserApprovalAction({ userId: UUID, approve: true });
    expect(res.status).toBe('success');
  });

  it('rejects invalid input via approvalSchema', async () => {
    const res = await setUserApprovalAction({ userId: 'bad', approve: true });
    expect(res).toMatchObject({ status: 'error', code: 'VALIDATION_ERROR' });
  });
});

// ---------------------------------------------------------------------------
// fallbackExtractor (Phase 6 metadata seam)
// ---------------------------------------------------------------------------
describe('deriveTitleFromFilename', () => {
  it('strips the extension and normalizes separators', () => {
    expect(deriveTitleFromFilename('my-great-book.epub')).toBe('my great book');
    expect(deriveTitleFromFilename('The_Hobbit.epub')).toBe('The Hobbit');
  });
  it('falls back to "Untitled" for an empty base name', () => {
    expect(deriveTitleFromFilename('.epub')).toBe('Untitled');
  });
});

describe('fallbackExtractor', () => {
  it('derives title from filename and returns no cover', async () => {
    const meta = await fallbackExtractor.extract({
      fileBytes: new Uint8Array(),
      filename: 'dune-part-one.epub',
    });
    expect(meta.title).toBe('dune part one');
    expect(meta.author).toBeNull();
    expect(meta.cover).toBeUndefined();
  });

  it('prefers form overrides when provided', async () => {
    const meta = await fallbackExtractor.extract({
      fileBytes: new Uint8Array(),
      filename: 'whatever.epub',
      formTitle: 'Dune',
      formAuthor: 'Frank Herbert',
    });
    expect(meta.title).toBe('Dune');
    expect(meta.author).toBe('Frank Herbert');
  });
});
