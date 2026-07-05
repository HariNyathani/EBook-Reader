import 'server-only';

/**
 * Beacon endpoint for guaranteed last-position save (ISD §10.E, §10.T).
 *
 * POST /api/progress — called by navigator.sendBeacon on pagehide/visibilitychange.
 * Designed for fire-and-forget: always returns 204, silently drops unauthenticated.
 *
 * Beacon constraints:
 * - No response body consumed by client
 * - No auth headers (cookies only)
 * - Must be fast and non-blocking
 *
 * ISD §10.E: sendBeacon cannot use Server Actions (no fetch API). This Route Handler
 * provides the same persistProgress logic with cookie-based auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClaims } from '@/features/auth/session';
import { progressSchema } from '@/features/reader/progress/schemas';
import { persistProgress } from '@/features/reader/progress/persist-progress';
import { progressLimiter, identifierForIp } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logging/logger';

export const runtime = 'nodejs'; // ISD §10.L: Node runtime (not Edge)

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get claims from cookies (beacon sends cookies, not auth headers)
    const claims = await getClaims();

    // ISD §10.E: Silently drop unauthenticated/unapproved (never error a beacon)
    if (!claims || !claims.isApproved) {
      return new NextResponse(null, { status: 204 });
    }

    // Rate-limit per user (Phase 15, ISD §15.B). Beacons are
    // fire-and-forget so we still return 204 on rejection; the
    // browser will retry naturally.
    const id = claims.userId ?? identifierForIp(request);
    const rl = await progressLimiter(id);
    if (!rl.success) {
      // Beacons are fire-and-forget; do not return 429. Log and
      // silently drop. The client will retry next time.
      logger.warn('rate_limit.exceeded', { policy: 'progress' });
      return new NextResponse(null, { status: 204 });
    }

    // Parse JSON body (beacon sends Blob with JSON)
    const body = await request.json();

    // Validate input (ISD §10.R: server-side validation, never trust client)
    const parsed = progressSchema.safeParse(body);
    if (!parsed.success) {
      // Invalid data — silently drop (beacon is fire-and-forget)
      return new NextResponse(null, { status: 204 });
    }

    const { bookId, cfi, percentage, updatedAt } = parsed.data;

    // Persist (conditional upsert, ISD §10.F)
    await persistProgress(claims.userId, bookId, cfi, percentage, updatedAt);

    // Always return 204 (beacon doesn't consume response)
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    // Any error — silently drop (beacon is fire-and-forget) but
    // log it for Sentry visibility.
    logger.error('progress.persist.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse(null, { status: 204 });
  }
}
