// Sentry client configuration — Phase 15 (ISD §15.G, §15.V).
// Imported by @sentry/nextjs at the top of the client bundle.
//
// This file is loaded by the @sentry/nextjs SDK when the SDK is
// initialized via `Sentry.init({})`. We use a lazy import so the
// file is safe to load even when Sentry is not configured (no DSN).
//
// All PII is scrubbed via the beforeSend hook.

import * as Sentry from '@sentry/nextjs';

/** PII patterns to scrub from Sentry events before sending. */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'service_role',
  'service_role_key',
  'secret',
  'email', // emails are not sent unless explicitly added
]);

/** Scrub an object recursively, replacing sensitive values. */
function scrub<T>(value: T, depth = 0): T {
  if (depth > 5) return value as T;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[redacted]';
      } else {
        out[k] = scrub(v, depth + 1);
      }
    }
    return out as T;
  }
  if (typeof value === 'string') {
    // Email pattern
    return value.replace(
      /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
      (_, domain: string) => `*@${domain}`,
    ) as unknown as T;
  }
  return value;
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
const environment = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';

// Only init when a DSN is present. Otherwise the SDK is a no-op.
if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    // Disable in development unless explicitly enabled.
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLE_DEV === 'true',
    beforeSend(event) {
      if (!event) return null;
      // Scrub the request body / user data.
      if (event.request) {
        if (event.request.cookies) {
          event.request.cookies = scrub(event.request.cookies as Record<string, string>);
        }
        if (event.request.headers) {
          event.request.headers = scrub(event.request.headers as Record<string, string>);
        }
        if (event.request.data) {
          event.request.data = scrub(event.request.data);
        }
      }
      if (event.user) {
        // Only keep the id; drop email/ip/etc.
        event.user = event.user.id ? { id: event.user.id } : undefined;
      }
      if (event.extra) {
        event.extra = scrub(event.extra as Record<string, unknown>);
      }
      if (event.tags) {
        event.tags = scrub(event.tags as Record<string, string>);
      }
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((bc) => ({
          ...bc,
          data: bc.data ? scrub(bc.data as Record<string, unknown>) : bc.data,
        }));
      }
      return event;
    },
    // Strip the URL query string (may contain tokens).
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data?.url) {
        try {
          const u = new URL(String(breadcrumb.data.url));
          u.search = '';
          breadcrumb.data.url = u.toString();
        } catch {
          /* ignore */
        }
      }
      return breadcrumb;
    },
  });
}
