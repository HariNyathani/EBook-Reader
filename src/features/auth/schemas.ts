import { z } from 'zod';
import { emailSchema } from '@/lib/validation/primitives';

/**
 * Validation schemas for authentication flows.
 * Phase 4 — Auth schemas.
 *
 * All schemas reuse primitives from src/lib/validation/primitives.ts.
 */

/** Password constraints: min 8 (security), max 72 (bcrypt limit). */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

/** Credentials for sign-in or sign-up (email + password). */
export const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/**
 * Registration schema.
 * ISD-NOTE: registerSchema === credentialsSchema for MVP. The ISD allows extending
 * with a display name field in a later phase; for now they are identical to avoid
 * duplication of validation logic. A confirmPassword refinement is omitted per ISD
 * guidance (Server Actions don't need double-entry UX for a walled garden).
 */
export const registerSchema = credentialsSchema;

export type Credentials = z.infer<typeof credentialsSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
