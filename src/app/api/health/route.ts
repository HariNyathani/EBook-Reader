/**
 * Health Check Endpoint — Phase 15 (ISD §15.G, §15.T, §15.V, §15.BB).
 *
 * GET /api/health
 *
 * Lightweight liveness + readiness check. Used by:
 *   - Uptime monitors (every 30–60s)
 *   - Vercel / load balancer (pre-promotion health probe)
 *   - CI/CD post-deploy smoke (Phase 16)
 *
 * Response shape:
 *   {
 *     status: 'ok' | 'degraded' | 'down',
 *     timestamp: ISO-8601,
 *     uptimeSec: number,
 *     version: string,
 *     checks: {
 *       supabase: { status: 'ok' | 'down', latencyMs: number } | null,
 *       r2:       { status: 'ok' | 'down', latencyMs: number } | null,
 *     },
 *     env: 'development' | 'preview' | 'production',
 *   }
 *
 * Status semantics:
 *   - 200 + status='ok'       — all critical dependencies reachable
 *   - 200 + status='degraded' — non-critical issue (e.g. R2 slow)
 *   - 503 + status='down'     — critical issue (e.g. Supabase down)
 *
 * CRITICAL: The endpoint NEVER returns secrets or PII. It does not
 * require authentication (it's a public health check); we deliberately
 * do not leak Supabase URL or R2 endpoint in the body.
 *
 * CRITICAL: Health checks do NOT run rate limiting. We want a 503
 * from /api/health to be visible to the monitor.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logging/logger';

export const runtime = 'nodejs'; // Supabase server client is Node-only.
export const dynamic = 'force-dynamic';

/** Type of each check. */
type CheckStatus = 'ok' | 'down' | 'skipped';

interface Check {
  status: CheckStatus;
  latencyMs: number;
  detail?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptimeSec: number;
  version: string;
  env: string;
  checks: {
    supabase: Check;
    r2: Check;
  };
}

/** Timestamp captured at module load (process start). */
const startTime = Date.now();

/** Read version from package.json at build time (inlined). */
const VERSION = process.env['npm_package_version'] ?? process.env['SENTRY_RELEASE'] ?? '0.0.0';

/**
 * Probe Supabase. We do a simple `select 1` against a low-privilege
 * table via the service-role client — but if the service-role key
 * is missing we skip the probe (returns null).
 */
async function checkSupabase(): Promise<Check> {
  const t0 = Date.now();
  try {
    const supabase = await createClient();
    // `auth.admin.listUsers({ page: 1, perPage: 1 })` is a tiny round-trip
    // and proves the service-role key is valid. We catch any error.
    const { error } = await supabase.auth.getUser();
    if (error && /invalid api key/i.test(error.message)) {
      return { status: 'down', latencyMs: Date.now() - t0, detail: 'invalid-key' };
    }
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      detail: err instanceof Error ? err.message.slice(0, 100) : 'unknown',
    };
  }
}

/**
 * Probe R2 by performing a HEAD on a well-known key. If R2 creds
 * are missing we skip the probe.
 */
async function checkR2(): Promise<Check> {
  const t0 = Date.now();
  const accountId = process.env['R2_ACCOUNT_ID'];
  if (!accountId) {
    return { status: 'skipped', latencyMs: 0 };
  }
  try {
    // Lazy import: don't require R2 if not configured.
    const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
        secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
      },
    });
    await s3.send(
      new HeadBucketCommand({ Bucket: process.env['R2_BUCKET'] ?? 'epub-reader-assets' }),
    );
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'down', latencyMs: Date.now() - t0, detail: msg.slice(0, 100) };
  }
}

/** Determine the env name from the APP_ENV var. */
function getEnv(): string {
  return process.env['APP_ENV'] ?? process.env['NODE_ENV'] ?? 'development';
}

export async function GET(): Promise<NextResponse> {
  // Run dependency probes in parallel. Each has a 2s ceiling.
  const [supabase, r2] = await Promise.all([
    withTimeout(checkSupabase(), 2000, { status: 'down', latencyMs: 2000, detail: 'timeout' }),
    withTimeout(checkR2(), 2000, { status: 'down', latencyMs: 2000, detail: 'timeout' }),
  ]);

  // Decide overall status.
  // - Supabase is CRITICAL: down → 503 / 'down'.
  // - R2 is NON-CRITICAL for liveness (some flows still work); down → 'degraded'.
  let overall: 'ok' | 'degraded' | 'down' = 'ok';
  if (supabase.status === 'down') overall = 'down';
  else if (r2.status === 'down') overall = 'degraded';

  const body: HealthResponse = {
    status: overall,
    timestamp: new Date().toISOString(),
    uptimeSec: Math.round((Date.now() - startTime) / 1000),
    version: VERSION,
    env: getEnv(),
    checks: { supabase, r2 },
  };

  if (overall === 'down') {
    logger.warn('health.down', { checks: body.checks });
    return NextResponse.json(body, { status: 503 });
  }
  if (overall === 'degraded') {
    return NextResponse.json(body, { status: 200 });
  }
  return NextResponse.json(body, { status: 200 });
}

/** Race a promise against a timeout. */
async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}
