/**
 * Unit tests for the strict, nonce-based CSP builder.
 *
 * Phase 15 (ISD §15.G, §15.Z, §15.AA, Appendix G.6). These tests
 * verify that the CSP NEVER includes 'unsafe-inline' for scripts,
 * always includes the per-request nonce, and preserves the
 * `blob:` allowances the foliate-js reader engine needs.
 */

import { describe, expect, it } from 'vitest';
import {
  buildCsp,
  generateNonce,
  buildCspReportOnly,
  buildSecurityHeaders,
} from '@/lib/security/csp';

describe('csp — nonce-based strict CSP (Phase 15)', () => {
  describe('generateNonce', () => {
    it('returns a base64 string of 24 chars (16 bytes encoded)', () => {
      const n = generateNonce();
      // 16 bytes → 24 base64 chars (no padding because 16 % 3 = 1
      // adds '==' padding for a final 24-char string).
      expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    });

    it('returns a different nonce each call (high entropy)', () => {
      const a = generateNonce();
      const b = generateNonce();
      expect(a).not.toBe(b);
    });
  });

  describe('buildCsp — script-src strictness', () => {
    it('NEVER uses unsafe-inline for scripts in production', () => {
      const csp = buildCsp({ nonce: 'abc', isDev: false });
      expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    });

    it('NEVER uses unsafe-inline for scripts in dev either', () => {
      const csp = buildCsp({ nonce: 'abc', isDev: true });
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    });

    it('includes the per-request nonce in script-src', () => {
      const csp = buildCsp({ nonce: 'unique-nonce-123' });
      expect(csp).toContain("'nonce-unique-nonce-123'");
    });

    it('includes strict-dynamic for script-src', () => {
      const csp = buildCsp({ nonce: 'abc' });
      expect(csp).toContain("'strict-dynamic'");
    });

    it('only allows unsafe-eval in dev (for HMR)', () => {
      const prod = buildCsp({ nonce: 'abc', isDev: false });
      expect(prod).not.toContain("'unsafe-eval'");
      const dev = buildCsp({ nonce: 'abc', isDev: true });
      expect(dev).toContain("'unsafe-eval'");
    });
  });

  describe('buildCsp — foliate-js required directives', () => {
    it('PRESERVES blob: in frame-src for the reader iframe', () => {
      const csp = buildCsp({ nonce: 'abc' });
      expect(csp).toContain("frame-src 'self' blob:");
    });

    it('PRESERVES blob: in img-src for cover/thumb blobs', () => {
      const csp = buildCsp({ nonce: 'abc' });
      expect(csp).toContain("img-src 'self' blob: data:");
    });

    it('PRESERVES blob: in worker-src for the service worker', () => {
      const csp = buildCsp({ nonce: 'abc' });
      expect(csp).toContain("worker-src 'self' blob:");
    });
  });

  describe('buildCsp — required security directives', () => {
    it('sets default-src self', () => {
      const csp = buildCsp({ nonce: 'abc' });
      expect(csp).toContain("default-src 'self'");
    });

    it('disallows object embedding', () => {
      const csp = buildCsp({ nonce: 'abc' });
      expect(csp).toContain("object-src 'none'");
    });

    it('locks down base-uri to self', () => {
      const csp = buildCsp({ nonce: 'abc' });
      expect(csp).toContain("base-uri 'self'");
    });

    it('restricts form-action to self', () => {
      const csp = buildCsp({ nonce: 'abc' });
      expect(csp).toContain("form-action 'self'");
    });

    it('restricts frame-ancestors to self (no third-party embedding)', () => {
      const csp = buildCsp({ nonce: 'abc' });
      expect(csp).toContain("frame-ancestors 'self'");
    });

    it('adds upgrade-insecure-requests in production', () => {
      const csp = buildCsp({ nonce: 'abc', isDev: false });
      expect(csp).toContain('upgrade-insecure-requests');
    });

    it('omits upgrade-insecure-requests in dev (we use http locally)', () => {
      const csp = buildCsp({ nonce: 'abc', isDev: true });
      expect(csp).not.toContain('upgrade-insecure-requests');
    });
  });

  describe('buildCsp — connect-src origin allowlisting', () => {
    it('includes the Supabase URL in connect-src when provided', () => {
      const csp = buildCsp({
        nonce: 'abc',
        supabaseUrl: 'https://abc.supabase.co',
      });
      expect(csp).toContain('https://abc.supabase.co');
    });

    it('includes the Sentry DSN host in connect-src when provided', () => {
      const csp = buildCsp({
        nonce: 'abc',
        sentryDsn: 'https://key@sentry.io/123',
      });
      // We strip the path/keys and keep just the origin.
      expect(csp).toContain('https://sentry.io');
    });

    it('omits Supabase/Sentry when not configured', () => {
      const csp = buildCsp({ nonce: 'abc' });
      expect(csp).toContain("connect-src 'self'");
      // The next ' ' after 'self' should be the end of the directive,
      // not another origin.
      const match = csp.match(/connect-src[^;]*/);
      expect(match?.[0]).toBe("connect-src 'self'");
    });
  });

  describe('buildCspReportOnly', () => {
    it('appends a report-uri directive', () => {
      const csp = buildCspReportOnly({ nonce: 'abc' }, 'https://example.com/api/csp-report');
      expect(csp).toContain('report-uri https://example.com/api/csp-report');
    });
  });

  describe('buildSecurityHeaders — full security header set', () => {
    it('includes the CSP', () => {
      const headers = buildSecurityHeaders({ nonce: 'abc', isProd: false });
      const csp = headers.find((h) => h.key === 'Content-Security-Policy');
      expect(csp).toBeDefined();
      expect(csp!.value).toContain("'nonce-abc'");
    });

    it('includes X-Content-Type-Options: nosniff', () => {
      const headers = buildSecurityHeaders({ nonce: 'abc' });
      const h = headers.find((h) => h.key === 'X-Content-Type-Options');
      expect(h?.value).toBe('nosniff');
    });

    it('includes Referrer-Policy: strict-origin-when-cross-origin', () => {
      const headers = buildSecurityHeaders({ nonce: 'abc' });
      const h = headers.find((h) => h.key === 'Referrer-Policy');
      expect(h?.value).toBe('strict-origin-when-cross-origin');
    });

    it('includes a strict Permissions-Policy that denies unused features', () => {
      const headers = buildSecurityHeaders({ nonce: 'abc' });
      const h = headers.find((h) => h.key === 'Permissions-Policy');
      expect(h?.value).toContain('camera=()');
      expect(h?.value).toContain('microphone=()');
      expect(h?.value).toContain('geolocation=()');
      expect(h?.value).toContain('payment=()');
    });

    it('emits HSTS in production only', () => {
      const prod = buildSecurityHeaders({ nonce: 'abc', isProd: true });
      expect(prod.find((h) => h.key === 'Strict-Transport-Security')?.value).toContain(
        'max-age=31536000',
      );
      const dev = buildSecurityHeaders({ nonce: 'abc', isProd: false });
      expect(dev.find((h) => h.key === 'Strict-Transport-Security')).toBeUndefined();
    });

    it('emits Cross-Origin-Opener-Policy in production only', () => {
      const prod = buildSecurityHeaders({ nonce: 'abc', isProd: true });
      expect(prod.find((h) => h.key === 'Cross-Origin-Opener-Policy')?.value).toBe('same-origin');
      const dev = buildSecurityHeaders({ nonce: 'abc', isProd: false });
      expect(dev.find((h) => h.key === 'Cross-Origin-Opener-Policy')).toBeUndefined();
    });
  });
});
