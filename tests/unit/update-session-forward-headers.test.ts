/**
 * Regression test for the CSP nonce-threading fix — server half.
 *
 * Proves that `updateSession(request, forwardRequestHeaders)` actually
 * layers the forwarded headers (CSP + nonce) onto the request-init it
 * hands to `NextResponse.next(...)`. This is the mechanism by which
 * Next.js sees the nonce and stamps it onto its inline scripts.
 *
 * We mock `server-only`, `@/lib/env`, and `@supabase/ssr` so the
 * edge/server module is loadable under jsdom and performs no network
 * I/O, then spy on `NextResponse.next` to inspect the forwarded headers.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/env', () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  },
}));

// Unauthenticated: getUser resolves with no user so no cookie writes /
// second NextResponse.next call occur.
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateSession — forwards request headers to NextResponse.next (regression)', () => {
  it('threads the CSP + x-nonce onto the forwarded request headers', async () => {
    const nextSpy = vi.spyOn(NextResponse, 'next');
    const { updateSession } = await import('@/lib/supabase/middleware');

    const req = new NextRequest('http://localhost/dashboard', { method: 'GET' });
    const csp = `default-src 'self'; script-src 'self' 'nonce-TESTNONCE' 'strict-dynamic'`;

    const { response, claims } = await updateSession(req, {
      'Content-Security-Policy': csp,
      'x-nonce': 'TESTNONCE',
    });

    expect(claims).toBeNull();
    expect(nextSpy).toHaveBeenCalled();

    // Inspect the request-init handed to NextResponse.next().
    const arg = nextSpy.mock.calls[0]![0] as { request?: { headers?: Headers } };
    expect(arg?.request?.headers).toBeInstanceOf(Headers);
    const headers = arg!.request!.headers!;
    expect(headers.get('content-security-policy')).toBe(csp);
    expect(headers.get('x-nonce')).toBe('TESTNONCE');

    expect(response).toBeInstanceOf(NextResponse);
  });

  it('does not set the forwarded headers when none are provided', async () => {
    const nextSpy = vi.spyOn(NextResponse, 'next');
    const { updateSession } = await import('@/lib/supabase/middleware');

    const req = new NextRequest('http://localhost/dashboard', { method: 'GET' });
    await updateSession(req);

    const arg = nextSpy.mock.calls[0]![0] as { request?: { headers?: Headers } };
    const headers = arg!.request!.headers!;
    expect(headers.get('x-nonce')).toBeNull();
  });
});
