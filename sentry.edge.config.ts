// Sentry edge configuration — Phase 15 (ISD §15.G, §15.V).
// Imported by @sentry/nextjs when the edge SDK initializes
// (middleware runs on the edge runtime).

import * as Sentry from '@sentry/nextjs';

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
  'email',
  'r2_secret_access_key',
  'r2_access_key_id',
  'upstash_redis_rest_token',
]);

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
    return value.replace(
      /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
      (_, domain: string) => `*@${domain}`,
    ) as unknown as T;
  }
  return value;
}

const dsn = process.env.SENTRY_DSN;
const environment = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLE_DEV === 'true',
    beforeSend(event) {
      if (!event) return null;
      if (event.request) {
        if (event.request.cookies) {
          event.request.cookies = scrub(event.request.cookies as Record<string, string>);
        }
        if (event.request.headers) {
          const headers = event.request.headers as Record<string, string>;
          for (const k of Object.keys(headers)) {
            if (/^(authorization|cookie|x-api-key|x-supabase)/i.test(k)) {
              headers[k] = '[redacted]';
            }
          }
          event.request.headers = headers;
        }
        if (event.request.data) {
          event.request.data = scrub(event.request.data);
        }
      }
      if (event.user) {
        event.user = event.user.id ? { id: event.user.id } : undefined;
      }
      if (event.extra) {
        event.extra = scrub(event.extra as Record<string, unknown>);
      }
      if (event.tags) {
        event.tags = scrub(event.tags as Record<string, string>);
      }
      return event;
    },
  });
}
