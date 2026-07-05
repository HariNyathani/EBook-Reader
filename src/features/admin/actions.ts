'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROUTES } from '@/lib/routes';
import { ok, fail } from '@/lib/result';
import type { ActionResult } from '@/lib/result';
import { requireAdmin } from '@/features/auth/session';
import { approvalSchema } from './schemas';

/**
 * Toggles a user's is_approved status in public.profiles.
 *
 * Security model (three-layer, per ISD §4.W):
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
  // Redirects to /dashboard if not admin; throws NEXT_REDIRECT if unauthenticated.
  try {
    await requireAdmin();
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

    // Step 4: Revalidate the approvals page so the server re-fetches unapproved users.
    revalidatePath(ROUTES.ADMIN_APPROVALS);

    return ok();
  } catch (err) {
    console.error('[setUserApprovalAction] Unexpected error:', err);
    return fail('Something went wrong. Please try again.', 'INTERNAL');
  }
}
