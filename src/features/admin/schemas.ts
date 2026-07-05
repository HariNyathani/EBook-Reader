import { z } from 'zod';
import { uuidSchema } from '@/lib/validation/primitives';

/**
 * Admin action validation schemas.
 * Phase 4 — Admin schemas.
 */

/** Input for toggling a user's approval status. */
export const approvalSchema = z.object({
  /** UUID of the user's profile to approve or revoke. */
  userId: uuidSchema,
  /** true = approve the user, false = revoke approval. */
  approve: z.boolean(),
});

export type ApprovalInput = z.infer<typeof approvalSchema>;

/** Input for toggling a user's admin status. */
export const adminToggleSchema = z.object({
  /** UUID of the user's profile to grant/revoke admin. */
  userId: uuidSchema,
  /** true = grant admin, false = revoke admin. */
  makeAdmin: z.boolean(),
});

export type AdminToggleInput = z.infer<typeof adminToggleSchema>;
