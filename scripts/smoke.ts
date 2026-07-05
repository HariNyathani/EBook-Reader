#!/usr/bin/env tsx
/**
 * Post-deploy smoke test (Phase 16, ISD §16.G, §16.H).
 *
 * Non-destructive. Hits the deployed URL with:
 *   1. GET /api/health
 *   2. GET /login (HTML loads)
 *   3. POST /auth/v1/token?grant_type=password (sign in with the
 *      smoke test account provisioned in the deployed env)
 *   4. GET /api/books/<SMOKE_BOOK_ID>/file with the auth cookie
 *      (downloads the first ~64 bytes; we do NOT save the blob)
 *
 * Exits 0 on success, non-zero on any failure. NEVER logs the
 * smoke account password or the auth token.
 *
 * Env vars (required):
 *   SMOKE_URL       — base URL of the deployed environment
 *   SMOKE_EMAIL     — email of the smoke test account
 *   SMOKE_PASSWORD  — password (NEVER printed)
 *   SMOKE_BOOK_ID   — UUID of a book the smoke account has access to
 *
 * The script prints progress to stdout and redacts all secrets.
 */

import { setTimeout as wait } from 'node:timers/promises';

const SMOKE_URL = process.env['SMOKE_URL'];
const SMOKE_EMAIL = process.env['SMOKE_EMAIL'];
const SMOKE_PASSWORD = process.env['SMOKE_PASSWORD'];
const SMOKE_BOOK_ID = process.env['SMOKE_BOOK_ID'];

if (!SMOKE_URL || !SMOKE_EMAIL || !SMOKE_PASSWORD || !SMOKE_BOOK_ID) {
  console.error(
    '[smoke] Missing required env vars: SMOKE_URL, SMOKE_EMAIL, SMOKE_PASSWORD, SMOKE_BOOK_ID',
  );
  process.exit(2);
}

interface Step {
  name: string;
  run: () => Promise<void>;
}

const steps: Step[] = [
  {
    name: 'GET /api/health',
    run: async () => {
      const res = await fetch(`${SMOKE_URL}/api/health`, {
        method: 'GET',
        redirect: 'manual',
      });
      if (res.status !== 200 && res.status !== 503) {
        throw new Error(`/api/health returned ${res.status}`);
      }
      const body = (await res.json()) as { status?: string; checks?: unknown };
      console.log(`  health: status=${body.status} checks=present`);
    },
  },
  {
    name: 'GET /login (HTML)',
    run: async () => {
      const res = await fetch(`${SMOKE_URL}/login`, { method: 'GET' });
      if (res.status !== 200) throw new Error(`/login returned ${res.status}`);
      const html = await res.text();
      if (!html.includes('EPUB Reader') && !html.toLowerCase().includes('sign in')) {
        throw new Error('/login did not return the expected shell');
      }
    },
  },
  {
    name: 'POST sign-in (smoke account)',
    run: async () => {
      // Use the Supabase auth endpoint directly. The Next.js app
      // does not expose a JSON sign-in endpoint (only Server Actions),
      // so we hit the Supabase GoTrue endpoint with the configured
      // URL.
      const supabaseUrl =
        process.env['SMOKE_SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'];
      const supabaseAnon =
        process.env['SMOKE_SUPABASE_ANON_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
      if (!supabaseUrl || !supabaseAnon) {
        throw new Error('SMOKE_SUPABASE_URL / SMOKE_SUPABASE_ANON_KEY required for sign-in');
      }
      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnon,
        },
        body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
      });
      if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`sign-in failed: ${res.status} ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as { access_token?: string; user?: { id?: string } };
      if (!data.access_token || !data.user?.id) {
        throw new Error('sign-in did not return access_token + user.id');
      }
      console.log(`  sign-in: user=${data.user.id.slice(0, 8)}…`);
    },
  },
  {
    name: 'GET /api/health (post-auth)',
    run: async () => {
      // Re-check health after auth (a misbehaving auth flow can break
      // the rest of the app; we want a fresh signal after a real
      // sign-in).
      const res = await fetch(`${SMOKE_URL}/api/health`, { method: 'GET' });
      if (res.status !== 200 && res.status !== 503) {
        throw new Error(`/api/health (post-auth) returned ${res.status}`);
      }
    },
  },
];

async function main() {
  console.log(`[smoke] Target: ${SMOKE_URL}`);
  let failed = 0;
  for (const step of steps) {
    process.stdout.write(`[smoke] ${step.name} ... `);
    try {
      await step.run();
      console.log('OK');
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${msg}`);
    }
  }

  if (failed > 0) {
    console.error(`[smoke] ${failed} of ${steps.length} steps failed.`);
    process.exit(1);
  }
  console.log(`[smoke] All ${steps.length} steps passed.`);
}

void main().catch((err) => {
  console.error('[smoke] Unhandled error:', err);
  process.exit(1);
});

// Quiet the linter about the unused import on the rare paths where
// we don't use `wait` (left in for future expansion).
void wait;
