import 'server-only';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ROUTES } from '@/lib/routes';

/**
 * Decoded claims from the Supabase JWT (top-level per §0.4).
 * This is the single source of truth for reading auth state in Server Components and Actions.
 */
export type Claims = {
  userId: string;
  isApproved: boolean;
  isAdmin: boolean;
};

/**
 * Returns the current Supabase session or null.
 * Uses the server SSR client (cookie-based, request-scoped).
 * Prefer getClaims() for authorization — this is for raw session data.
 */
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Returns decoded top-level JWT claims { userId, isApproved, isAdmin } or null.
 *
 * Reads top-level is_approved / is_admin injected by the custom_access_token_hook (Phase 3 §0.4).
 * If the access token hook is not enabled, claims will be missing → fail-closed (returns null).
 *
 * Uses getUser() (not getSession()) per @supabase/ssr guidance for validated server-side auth.
 */
export async function getClaims(): Promise<Claims | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  // Re-read the raw session to get the access token for claim extraction
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  // Decode the access token payload (base64url, no signature verification needed —
  // the server client has already validated it via getUser()).
  // ISD-NOTE: We do not use SUPABASE_JWT_SECRET for manual sig verification here because
  // the @supabase/ssr server client already validates the token server-side via getUser().
  // Per Phase 4 §4.J, this is the default path.
  let payload: Record<string, unknown> = {};
  try {
    const [, payloadB64] = session.access_token.split('.');
    payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf-8')) as Record<
      string,
      unknown
    >;
  } catch {
    // Malformed token — fail-closed
    return null;
  }

  // Read top-level claims (injected by custom_access_token_hook).
  // If absent (hook not enabled), fail-closed: treat as unapproved non-admin.
  const isApproved = payload['is_approved'] === true;
  const isAdmin = payload['is_admin'] === true;

  return {
    userId: user.id,
    isApproved,
    isAdmin,
  };
}

/**
 * Defense-in-depth guard for (app)/* layouts and protected Server Actions.
 * Returns claims if the user is authenticated AND approved.
 * Redirects to LOGIN if unauthenticated; to PENDING_APPROVAL if approved=false.
 *
 * Middleware performs the same check at the edge; layouts call this independently
 * because middleware can be bypassed (e.g., direct server render, test environments).
 */
export async function requireApproved(): Promise<Claims> {
  const claims = await getClaims();

  if (!claims) {
    redirect(ROUTES.LOGIN);
  }

  if (!claims.isApproved) {
    redirect(ROUTES.PENDING_APPROVAL);
  }

  return claims;
}

/**
 * Defense-in-depth guard for admin/* layouts and admin Server Actions.
 * Returns claims if the user is authenticated, approved, AND admin.
 * Redirects to DASHBOARD if authenticated but not admin (approved assumed by requireApproved logic).
 */
export async function requireAdmin(): Promise<Claims> {
  const claims = await getClaims();

  if (!claims) {
    redirect(ROUTES.LOGIN);
  }

  if (!claims.isApproved) {
    redirect(ROUTES.PENDING_APPROVAL);
  }

  if (!claims.isAdmin) {
    redirect(ROUTES.DASHBOARD);
  }

  return claims;
}
