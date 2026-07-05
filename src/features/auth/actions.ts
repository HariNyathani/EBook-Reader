'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { ROUTES } from '@/lib/routes';
import { ok, fail } from '@/lib/result';
import type { ActionResult } from '@/lib/result';
import { credentialsSchema, registerSchema } from './schemas';
import { authLimiter, identifierForIp, identifierForAuth } from '@/lib/security/rate-limit';
import { logger } from '@/lib/logging/logger';

/**
 * Helper: extract the client IP from the incoming request headers.
 * Used for rate-limiting at the Server-Action layer.
 */
async function getClientIp(): Promise<string> {
  try {
    const h = await headers();
    return identifierForIp(new Request('http://x', { headers: h }));
  } catch {
    return 'unknown';
  }
}

/**
 * Helper: enforce the auth rate limit. Returns null on success, or
 * an ActionResult describing the failure to the caller.
 */
async function enforceAuthRateLimit(
  email: string | null | undefined,
): Promise<ActionResult | null> {
  const ip = await getClientIp();
  const id = identifierForAuth(ip, email ?? null);
  const result = await authLimiter(id);
  if (!result.success) {
    logger.warn('rate_limit.exceeded', {
      policy: 'auth',
      ip,
      retryAfter: result.retryAfter,
    });
    return fail(
      `Too many sign-in attempts. Please try again in ${result.retryAfter} seconds.`,
      'RATE_LIMITED',
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sign Up
// ---------------------------------------------------------------------------

/**
 * Registers a new user via Supabase Auth.
 *
 * On success, the Phase 3 handle_new_user trigger auto-creates a profiles row
 * with is_approved=false. The caller should redirect to /pending-approval.
 *
 * Configuration note: email confirmation is DISABLED for this private walled garden.
 * The admin approval flow (not email verification) is the access gate.
 * To enable email confirmation, toggle in Supabase Dashboard → Auth → Email → Enable confirmations.
 */
export async function signUpAction(formData: FormData): Promise<ActionResult> {
  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = registerSchema.safeParse(rawData);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => e.message).join('; ');
    return fail(message, 'VALIDATION_ERROR');
  }

  const { email, password } = parsed.data;

  // Rate-limit BEFORE talking to Supabase (cheap rejection).
  const limited = await enforceAuthRateLimit(email);
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      // Avoid user enumeration: return a generic message for duplicate emails too.
      // Supabase returns "User already registered" for duplicates.
      const isDuplicate = error.message?.toLowerCase().includes('already registered');
      if (isDuplicate) {
        return fail('An account with this email already exists.', 'DUPLICATE_EMAIL');
      }
      // Log unexpected errors server-side but return generic message to client.
      console.error('[signUpAction] Supabase error:', error.message);
      return fail('Registration failed. Please try again.', 'SIGNUP_ERROR');
    }

    return ok();
  } catch (err) {
    console.error('[signUpAction] Unexpected error:', err);
    return fail('Something went wrong. Please try again.', 'INTERNAL');
  }
}

// ---------------------------------------------------------------------------
// Sign In
// ---------------------------------------------------------------------------

/**
 * Signs in with email and password via Supabase Auth.
 *
 * On success, the session cookie is set by the SSR client. The middleware will
 * then redirect the user appropriately based on is_approved / is_admin claims.
 *
 * Returns ok() on success — the caller redirects to redirectTo or /dashboard.
 * Generic error messages prevent user enumeration.
 */
export async function signInAction(formData: FormData, redirectTo?: string): Promise<ActionResult> {
  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = credentialsSchema.safeParse(rawData);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => e.message).join('; ');
    return fail(message, 'VALIDATION_ERROR');
  }

  const { email, password } = parsed.data;

  // Rate-limit BEFORE talking to Supabase.
  const limited = await enforceAuthRateLimit(email);
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Generic message — do not differentiate "user not found" from "wrong password".
      console.error('[signInAction] Supabase error:', error.message);
      return fail('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    // Validate and sanitize redirectTo to prevent open redirect.
    // Only allow same-origin paths starting with '/'.
    const safeRedirect =
      redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')
        ? redirectTo
        : ROUTES.DASHBOARD;

    redirect(safeRedirect);
  } catch (err) {
    // redirect() throws a special Next.js error — re-throw it.
    if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    console.error('[signInAction] Unexpected error:', err);
    return fail('Something went wrong. Please try again.', 'INTERNAL');
  }
}

// ---------------------------------------------------------------------------
// Sign Out
// ---------------------------------------------------------------------------

/**
 * Signs out the current user and redirects to /login.
 * Clears the session cookie via the SSR client.
 */
export async function signOutAction(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('[signOutAction] Supabase error:', error.message);
      return fail('Sign out failed. Please try again.', 'SIGNOUT_ERROR');
    }

    redirect(ROUTES.LOGIN);
  } catch (err) {
    // redirect() throws a special Next.js error — re-throw it.
    if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    console.error('[signOutAction] Unexpected error:', err);
    return fail('Something went wrong. Please try again.', 'INTERNAL');
  }
}
