/**
 * Regression test for the CSP nonce-threading fix (Phase 15 audit).
 *
 * THE BUG: middleware generated a per-request nonce and set the CSP +
 * `x-nonce` only on the RESPONSE. Next.js stamps its own inline
 * bootstrap/hydration scripts by reading the nonce from the incoming
 * `Content-Security-Policy` REQUEST header (forwarded via
 * `NextResponse.next({ request: { headers } })`). Because the nonce was
 * never threaded onto the forwarded request, Next emitted un-nonced
 * inline scripts which — under `script-src 'nonce-…' 'strict-dynamic'`
 * with no `unsafe-inline` — are blocked by the browser, breaking the
 * app in production.
 *
 * THE FIX: middleware passes the CSP value + nonce to `updateSession`
 * as forwarded request headers, and sets the SAME nonce on the response.
 *
 * This test mocks `updateSession` to capture the forwarded headers and
 * asserts the round-trip. The companion test
 * `update-session-forward-headers.test.ts` proves `updateSession`
 * actually places those headers onto `NextResponse.next`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Capture the headers middleware forwards to updateSession.
const captured = vi.hoisted(() => ({
  forwardHeaders: null as Record<string, string> | null,
}));

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn(
    async (_req: NextRequest, forwardRequestHeaders?: Record<string, string>) => {
      captured.forwardHeaders = forwardRequestHeaders ?? null;
      // Return a real NextResponse so attachSecurityHeaders can set headers.
      return { response: NextResponse.next(), claims: null };
    },
  ),
}));

beforeEach(() => {
  // Keep Upstash unconfigured so no network / rate-limit path runs.
  delete process.env['UPSTASH_REDIS_REST_URL'];
  delete process.env['UPSTASH_REDIS_REST_TOKEN'];
  captured.forwardHeaders = null;
});

describe('middleware — CSP nonce threading (regression: Phase 15 fix)', () => {
  it('forwards the CSP + x-nonce onto the request AND sets the same nonce on the response', async () => {
    const { middleware } = await import('@/middleware');

    const req = new NextRequest('http://localhost/', { method: 'GET' });
    const res = await middleware(req);

    // 1. updateSession received forwarded request headers.
    expect(captured.forwardHeaders).toBeTruthy();
    const fwd = captured.forwardHeaders!;
    const fwdCsp = fwd['Content-Security-Policy'];
    expect(fwdCsp).toBeTruthy();
    expect(fwdCsp).toContain(`'strict-dynamic'`);
    // Never unsafe-inline in script-src — that would defeat the nonce.
    expect(fwdCsp).not.toMatch(/script-src[^;]*'unsafe-inline'/);

    // 2. A concrete nonce is present and consistent with x-nonce.
    const match = fwdCsp!.match(/'nonce-([^']+)'/);
    expect(match).toBeTruthy();
    const nonce = match![1]!;
    expect(nonce.length).toBeGreaterThan(0);
    expect(fwd['x-nonce']).toBe(nonce);

    // 3. The RESPONSE carries the SAME nonce (CSP + x-nonce) so the
    //    scripts Next stamps with the request nonce are allowed.
    const resCsp = res.headers.get('Content-Security-Policy');
    expect(resCsp).toContain(`'nonce-${nonce}'`);
    expect(res.headers.get('x-nonce')).toBe(nonce);
  });

  it('generates a fresh nonce per request (no reuse across requests)', async () => {
    const { middleware } = await import('@/middleware');

    const res1 = await middleware(new NextRequest('http://localhost/', { method: 'GET' }));
    const nonce1 = captured.forwardHeaders!['x-nonce'];
    const res2 = await middleware(new NextRequest('http://localhost/', { method: 'GET' }));
    const nonce2 = captured.forwardHeaders!['x-nonce'];

    expect(nonce1).toBeTruthy();
    expect(nonce2).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
    expect(res1.headers.get('x-nonce')).toBe(nonce1);
    expect(res2.headers.get('x-nonce')).toBe(nonce2);
  });
});
