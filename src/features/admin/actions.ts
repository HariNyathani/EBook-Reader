'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/result';
import type { ActionResult } from '@/lib/result';
import { requireAdmin } from '@/features/auth/session';
import { approvalSchema, adminToggleSchema } from './schemas';

/**
 * Toggles a user's is_approved status in public.profiles.
 *
 * Security model (three-layer, per ISD §5.W):
 * 1. Middleware (edge): blocks non-admin requests to /admin/* before this runs.
 * 2. Layout guard (requireAdmin in admin/layout.tsx): blocks on server-render path.
 * 3. **This action (requireAdmin)**: authorizes the mutation server-side independently.
 *    The UI never determines whether a user is admin — this check is always re-evaluated.
 *
 * Uses the service-role admin client (RLS bypassed) to write to profiles.is_approved.
 * This is the ONLY place in the codebase that may legitimately call createAdminClient for profile updates.
 *
 * Staleness note: the approved user's new access takes effect on their next token refresh or login.
 * The custom_access_token_hook reads from profiles at token-issue time (Phase 3 §3.X).
 *
 * @param input - { userId: string (UUID), approve: boolean }
 */
export async function setUserApprovalAction(input: unknown): Promise<ActionResult> {
  // Step 1: Authorization — server-side admin check (defense-in-depth).
  let claims;
  try {
    claims = await requireAdmin();
  } catch (err) {
    // Re-throw Next.js redirect (from requireAdmin → redirect())
    if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    return fail('Unauthorized', 'FORBIDDEN');
  }

  // Step 2: Input validation.
  const parsed = approvalSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => e.message).join('; ');
    return fail(message, 'VALIDATION_ERROR');
  }

  const { userId, approve } = parsed.data;

  // Step 2.5: Self-protection guard — admin cannot revoke their own approval.
  if (claims.userId === userId && !approve) {
    return fail('You cannot revoke your own approval.', 'SELF_DEMOTE');
  }

  // Step 3: Mutation via service-role client.
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .update({ is_approved: approve })
      .eq('id', userId);

    if (error) {
      console.error('[setUserApprovalAction] Supabase error:', error.message);
      return fail('Failed to update user approval status.', 'DB_ERROR');
    }

    // Step 4: Revalidate admin pages so the server re-fetches.
    revalidatePath('/admin/users');
    revalidatePath('/admin');

    return ok();
  } catch (err) {
    console.error('[setUserApprovalAction] Unexpected error:', err);
    return fail('Something went wrong. Please try again.', 'INTERNAL');
  }
}

/**
 * Toggles a user's is_admin status in public.profiles.
 *
 * Self-protection guards (ISD §5.W):
 * - An admin cannot revoke their own admin rights (prevents accidental self-lockout).
 * - The system cannot drop to zero admins (prevents complete lockout).
 *
 * @param input - { userId: string (UUID), makeAdmin: boolean }
 */
export async function setUserAdminAction(input: unknown): Promise<ActionResult> {
  // Step 1: Authorization
  let claims;
  try {
    claims = await requireAdmin();
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw err;
    return fail('Unauthorized', 'FORBIDDEN');
  }

  // Step 2: Input validation.
  const parsed = adminToggleSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => e.message).join('; ');
    return fail(message, 'VALIDATION_ERROR');
  }

  const { userId, makeAdmin } = parsed.data;

  // Step 2.5: Self-protection — admin cannot revoke their own admin rights.
  if (claims.userId === userId && !makeAdmin) {
    return fail('You cannot remove your own admin access.', 'SELF_DEMOTE');
  }

  // Step 2.6: Last-admin guard — cannot demote the last admin.
  if (!makeAdmin) {
    try {
      const admin = createAdminClient();
      const { count, error: countError } = await admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_admin', true);

      if (countError) {
        console.error('[setUserAdminAction] Error counting admins:', countError.message);
        return fail('Failed to check admin count.', 'INTERNAL');
      }

      if ((count ?? 0) <= 1) {
        return fail('At least one admin must remain.', 'LAST_ADMIN');
      }
    } catch (err) {
      console.error('[setUserAdminAction] Error counting admins:', err);
      return fail('Something went wrong.', 'INTERNAL');
    }
  }

  // Step 3: Mutation via service-role client.
  try {
    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('profiles')
      .update({ is_admin: makeAdmin })
      .eq('id', userId);

    if (error) {
      console.error('[setUserAdminAction] Supabase error:', error.message);
      return fail('Failed to update admin status.', 'DB_ERROR');
    }

    // Step 4: Revalidate admin pages.
    revalidatePath('/admin/users');
    revalidatePath('/admin');

    return ok();
  } catch (err) {
    console.error('[setUserAdminAction] Unexpected error:', err);
    return fail('Something went wrong. Please try again.', 'INTERNAL');
  }
}
