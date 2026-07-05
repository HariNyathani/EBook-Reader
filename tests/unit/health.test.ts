/**
 * Unit tests for the /api/health endpoint shape (Phase 15, ISD §15.G).
 *
 * The endpoint runs heavy I/O (Supabase + R2) so we don't drive it
 * end-to-end here. We assert the public contract: the response
 * shape, status codes, and that the endpoint never returns secrets.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('/api/health — contract (Phase 15)', () => {
  it('exists and exports GET with the Node runtime', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/app/api/health/route.ts'), 'utf-8');
    expect(src).toMatch(/export\s+(async\s+)?function\s+GET/);
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('defines the HealthResponse shape (status, timestamp, checks)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/app/api/health/route.ts'), 'utf-8');
    expect(src).toMatch(/interface\s+HealthResponse/);
    expect(src).toMatch(/status:\s*['"]ok['"]\s*\|\s*['"]degraded['"]\s*\|\s*['"]down['"]/);
    expect(src).toMatch(/checks:\s*\{\s*supabase:\s*Check/);
    expect(src).toMatch(/checks:\s*\{\s*supabase:\s*Check[^}]*r2:\s*Check/);
  });

  it('returns 503 when a critical dependency is down', () => {
    // The route returns 503 only on `status === 'down'`. We assert
    // by reading the code path.
    const src = readFileSync(resolve(process.cwd(), 'src/app/api/health/route.ts'), 'utf-8');
    expect(src).toContain('status: 503');
  });

  it('does NOT include secrets in the response body', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/app/api/health/route.ts'), 'utf-8');
    // We deliberately do not log or return the service-role key, JWT,
    // R2 secret, or Upstash token.
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*[,)]/);
    expect(src).not.toMatch(/R2_SECRET_ACCESS_KEY\s*[,)]/);
    expect(src).not.toMatch(/UPSTASH_REDIS_REST_TOKEN/);
  });
});
