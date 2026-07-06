/**
 * Regression tests for progress-save revalidation placement (Phase 16 hotfix).
 *
 * saveProgressAction MUST NOT call revalidateTag: a Server-Action
 * revalidation re-renders the CURRENT route's RSC tree inside the POST
 * response, so every debounced save re-ran the reader page (~1s), shipped a
 * fresh `initialCfi` prop to the open reader, and fed the engine
 * re-initialization loop.
 *
 * The per-user progress cache is instead invalidated when the user LEAVES
 * the reader: endSessionAction (unmount/pagehide) and the /api/progress
 * beacon route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { revalidateTagMock } = vi.hoisted(() => ({
  revalidateTagMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: revalidateTagMock,
}));

vi.mock('@/features/auth/session', () => ({
  requireApproved: vi.fn(async () => ({ userId: 'user-1', isApproved: true })),
}));

vi.mock('@/features/reader/progress/persist-progress', () => ({
  persistProgress: vi.fn(async () => ({ updated_at: '2026-07-06T00:00:00.000Z' })),
  persistSession: vi.fn(async () => undefined),
}));

import { saveProgressAction, endSessionAction } from '@/features/reader/progress/actions';
import { progressTag } from '@/features/library/cache';

const BOOK_ID = '11111111-1111-4111-8111-111111111111';

describe('progress action revalidation wiring', () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
  });

  it('saveProgressAction persists WITHOUT revalidating (hot path, fires every few page turns)', async () => {
    const result = await saveProgressAction({
      bookId: BOOK_ID,
      cfi: 'epubcfi(/6/2!/4/2)',
      percentage: 42,
      updatedAt: '2026-07-06T00:00:00.000Z',
    });

    expect(result.status).toBe('success');
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('endSessionAction revalidates the per-user progress tag (user is leaving the reader)', async () => {
    const result = await endSessionAction({
      bookId: BOOK_ID,
      startedAt: '2026-07-06T00:00:00.000Z',
      endedAt: '2026-07-06T00:10:00.000Z',
      durationSeconds: 600,
    });

    expect(result.status).toBe('success');
    expect(revalidateTagMock).toHaveBeenCalledWith(progressTag('user-1'));
  });
});
