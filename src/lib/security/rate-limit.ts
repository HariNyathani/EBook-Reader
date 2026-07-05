/**
 * Rate Limiting — Phase 15 (ISD §15.G, §15.B, §15.Z, §15.CC).
 *
 * Implements per-route rate limiting via `@upstash/ratelimit` and
 * `@upstash/redis`. When Upstash environment variables are missing
 * (development, preview, or partial config), the module falls back
 * to an in-process LRU/Map-backed limiter with a documented
 * `ISD-NOTE` so the deployment decision is visible.
 *
 * The fallback is acceptable ONLY because:
 *   1. The Next.js Edge runtime is single-region per deployment.
 *   2. Our auth flow is ALSO protected by Supabase Auth (the
 *      primary defense against credential stuffing).
 *   3. The fallback fails OPEN on auth (better UX than fail-closed
 *      during an outage), but logs the fallback usage so an
 *      operator can detect the misconfig.
 *
 * The exported `checkLimit` function is the ONLY public surface.
 * Each named policy is a closure that the middleware/action can
 * invoke with a stable identifier (IP, user id, email).
 *
 * IMPORTANT: Rate limiting is applied at the EDGE in middleware for
 * route-handler-shaped endpoints (`/api/progress`, `/api/books/...`)
 * and in Server Actions for actions (where middleware cannot
 * intercept the request body). See `src/middleware.ts` for the
 * wiring.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logging/logger';

/** Result of a rate-limit check. */
export interface RateLimitResult {
  /** Whether the request is allowed. */
  success: boolean;
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** How many requests remain in the current window. */
  remaining: number;
  /** When the current window resets (ms epoch). */
  reset: number;
  /** Time-to-retry in seconds (only meaningful when !success). */
  retryAfter: number;
  /** Whether the in-memory fallback was used. */
  fallback: boolean;
  /** The policy that matched. */
  policy: string;
}

/** A limiter policy — a function that takes an identifier and returns a result. */
export type RateLimitPolicy = (identifier: string) => Promise<RateLimitResult>;

/** Internal: a per-policy descriptor (window, prefix). */
interface PolicySpec {
  /** Logical name (used in logs / error responses). */
  name: string;
  /** Maximum requests in the window. */
  limit: number;
  /** Window in seconds. */
  windowSec: number;
  /** Key prefix for both Upstash and fallback (so different policies do not collide). */
  prefix: string;
}

// ===========================================================================
// Policy specifications
// ===========================================================================

/**
 * POLICY DECLARATIONS (ISD §15.G, §15.BB):
 *
 *   authLimiter    — 5 requests / minute / IP+email. Defends the
 *                    /login and /register server actions against
 *                    credential stuffing and enumeration. Strict.
 *
 *   uploadLimiter  — 20 requests / hour / admin user id. Defends
 *                    the admin upload server action against a
 *                    misbehaving client uploading too fast.
 *
 *   progressLimiter — 600 requests / minute / user id. The progress
 *                    beacon is high-frequency by design (one beacon
 *                    per pagehide + 4Hz debounced saves on long
 *                    sessions). 600/min ≈ 10/sec which is well
 *                    above realistic human usage.
 *
 *   defaultLimiter — 60 requests / minute / IP. Catch-all for any
 *                    other route we want to defend.
 *
 * All values can be tuned in a future deploy without code changes
 * (the Upstash limits are constructed once per cold start).
 */
const POLICIES: Record<string, PolicySpec> = {
  auth: { name: 'auth', limit: 5, windowSec: 60, prefix: 'rl:auth' },
  upload: { name: 'upload', limit: 20, windowSec: 3600, prefix: 'rl:upload' },
  progress: { name: 'progress', limit: 600, windowSec: 60, prefix: 'rl:progress' },
  default: { name: 'default', limit: 60, windowSec: 60, prefix: 'rl:default' },
};

// ===========================================================================
// Upstash wiring
// ===========================================================================

/** Whether Upstash is configured. Read once at module load. */
function isUpstashConfigured(): boolean {
  return (
    typeof process.env['UPSTASH_REDIS_REST_URL'] === 'string' &&
    process.env['UPSTASH_REDIS_REST_URL']!.length > 0 &&
    typeof process.env['UPSTASH_REDIS_REST_TOKEN'] === 'string' &&
    process.env['UPSTASH_REDIS_REST_TOKEN']!.length > 0
  );
}

/** Singleton Redis client (Upstash). Lazily constructed. */
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (_redis) return _redis;
  _redis = new Redis({
    url: process.env['UPSTASH_REDIS_REST_URL']!,
    token: process.env['UPSTASH_REDIS_REST_TOKEN']!,
    // Aggressive timeout: rate limiting must never block the request path.
    // MUST be a factory (not a single AbortSignal): the Upstash client
    // reuses the config `signal` for every request, so a one-shot
    // `AbortSignal.timeout(500)` would fire once and then permanently
    // abort all subsequent calls — silently disabling the distributed
    // limiter and forcing the in-memory fallback forever.
    signal: () => AbortSignal.timeout(500),
  });
  return _redis;
}

/**
 * Build a named Upstash limiter, or null if not configured.
 * Each policy uses a sliding window for accuracy.
 */
function buildUpstashLimiter(spec: PolicySpec): Ratelimit | null {
  if (!isUpstashConfigured()) return null;
  try {
    return new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(spec.limit, `${spec.windowSec} s`),
      analytics: false, // analytics sends to Upstash dashboard; we don't need it
      prefix: spec.prefix,
      timeout: 500, // ms
    });
  } catch (err) {
    logger.warn('Failed to build Upstash rate limiter; using in-memory fallback', {
      policy: spec.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ===========================================================================
// In-memory fallback (ISD-NOTE: best-effort, single-region)
// ===========================================================================

/** A single fallback window. */
interface FallbackWindow {
  count: number;
  resetAt: number;
}

/** Per-process in-memory limiter state. Bounded to avoid memory growth. */
const MAX_FALLBACK_KEYS = 10_000;
const fallbackWindows = new Map<string, FallbackWindow>();

/** Periodic GC to remove expired windows. Runs at most every minute. */
let lastGc = 0;
function maybeGc(now: number): void {
  if (now - lastGc < 60_000) return;
  lastGc = now;
  for (const [key, win] of fallbackWindows) {
    if (win.resetAt <= now) fallbackWindows.delete(key);
  }
  // If we still exceed the cap, drop the oldest-reset entries.
  if (fallbackWindows.size > MAX_FALLBACK_KEYS) {
    const sorted = Array.from(fallbackWindows.entries()).sort(
      (a, b) => a[1].resetAt - b[1].resetAt,
    );
    const toRemove = sorted.slice(0, fallbackWindows.size - MAX_FALLBACK_KEYS);
    for (const [key] of toRemove) fallbackWindows.delete(key);
  }
}

/**
 * In-memory sliding-window approximation: counts requests in a fixed
 * window of `windowSec` seconds. The "sliding" part is approximated
 * by counting only requests whose resetAt is in the future.
 */
function fallbackCheck(spec: PolicySpec, identifier: string): RateLimitResult {
  const key = `${spec.prefix}:${identifier}`;
  const now = Date.now();
  maybeGc(now);
  const win = fallbackWindows.get(key);
  if (!win || win.resetAt <= now) {
    fallbackWindows.set(key, { count: 1, resetAt: now + spec.windowSec * 1000 });
    return {
      success: true,
      limit: spec.limit,
      remaining: spec.limit - 1,
      reset: now + spec.windowSec * 1000,
      retryAfter: 0,
      fallback: true,
      policy: spec.name,
    };
  }
  if (win.count >= spec.limit) {
    return {
      success: false,
      limit: spec.limit,
      remaining: 0,
      reset: win.resetAt,
      retryAfter: Math.max(1, Math.ceil((win.resetAt - now) / 1000)),
      fallback: true,
      policy: spec.name,
    };
  }
  win.count += 1;
  return {
    success: true,
    limit: spec.limit,
    remaining: spec.limit - win.count,
    reset: win.resetAt,
    retryAfter: 0,
    fallback: true,
    policy: spec.name,
  };
}

// ===========================================================================
// Public: policy factories
// ===========================================================================

/**
 * Construct a limiter for a named policy. The returned function is
 * stable across calls (singleton per process).
 */
function buildLimiter(policyName: keyof typeof POLICIES): RateLimitPolicy {
  const spec = POLICIES[policyName];
  if (!spec) throw new Error(`[rate-limit] Unknown policy: ${String(policyName)}`);

  // Cache the constructed limiter and the fallback flag per-policy.
  const cached: { upstash: Ratelimit | null; decided: boolean } = {
    upstash: null,
    decided: false,
  };

  return async (identifier: string): Promise<RateLimitResult> => {
    // Lazy decision: build the Upstash limiter once, then cache.
    if (!cached.decided) {
      cached.upstash = buildUpstashLimiter(spec);
      cached.decided = true;
      if (cached.upstash === null) {
        logger.info('Rate limiter using in-memory fallback (Upstash not configured)', {
          policy: spec.name,
        });
      }
    }

    // Use Upstash when available, but fall back transparently on any
    // network/timeout error so a single Upstash outage cannot lock
    // legitimate users out (ISD §15.CC).
    if (cached.upstash) {
      try {
        const r = await cached.upstash.limit(identifier);
        return {
          success: r.success,
          limit: r.limit,
          remaining: r.remaining,
          reset: r.reset,
          retryAfter: Math.max(0, Math.ceil((r.reset - Date.now()) / 1000)),
          fallback: false,
          policy: spec.name,
        };
      } catch (err) {
        logger.warn('Upstash rate-limit check failed; using in-memory fallback', {
          policy: spec.name,
          error: err instanceof Error ? err.message : String(err),
        });
        // fall through to in-memory
      }
    }

    return fallbackCheck(spec, identifier);
  };
}

/** Public policy instances. */
export const authLimiter: RateLimitPolicy = buildLimiter('auth');
export const uploadLimiter: RateLimitPolicy = buildLimiter('upload');
export const progressLimiter: RateLimitPolicy = buildLimiter('progress');
export const defaultLimiter: RateLimitPolicy = buildLimiter('default');

/**
 * Helper: extract a stable identifier for IP+email-shaped rate limits.
 * Combines the client IP with the lowercased email (if any) so a
 * single attacker cannot bypass the limit by trying many emails.
 *
 * @param ip - The client IP (from x-forwarded-for or x-real-ip)
 * @param email - Optional email to combine
 * @returns A stable identifier string
 */
export function identifierForAuth(ip: string, email?: string | null): string {
  const e = (email ?? '').toLowerCase().trim();
  return e ? `${ip}|${e}` : ip;
}

/**
 * Helper: extract a stable identifier for IP-only rate limits.
 * Prefers the first hop in x-forwarded-for (the actual client), falls
 * back to the request's remote address.
 */
export function identifierForIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const xReal = request.headers.get('x-real-ip');
  if (xReal) return xReal.trim();
  return 'unknown';
}

/**
 * Standard error response for rate-limited requests (ISD §15.U).
 * Server Actions consume the body; route handlers also use this shape.
 */
export function rateLimitErrorResponse(result: RateLimitResult): {
  status: 'error';
  code: 'RATE_LIMITED';
  message: string;
  retryAfter: number;
} {
  return {
    status: 'error',
    code: 'RATE_LIMITED',
    message: `Too many requests. Try again in ${result.retryAfter}s.`,
    retryAfter: result.retryAfter,
  };
}

/** Test-only: reset the in-memory fallback state. */
export function _resetRateLimitFallbackForTests(): void {
  fallbackWindows.clear();
  lastGc = 0;
}

/** Test-only: inspect fallback state. */
export function _getFallbackSizeForTests(): number {
  return fallbackWindows.size;
}
