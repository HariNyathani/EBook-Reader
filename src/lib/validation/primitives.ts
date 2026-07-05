import { z } from 'zod';
import type { ActionResult } from '@/lib/result';
import { ok, fail } from '@/lib/result';

/** Validates that a string is a valid UUID v4. */
export const uuidSchema = z.string().uuid();

/** Validates that a string is a valid email address. */
export const emailSchema = z.string().email();

/** Validates that a string is non-empty after trimming whitespace. */
export const nonEmptyString = z.string().trim().min(1);

/**
 * Parses a value against a Zod schema and throws if validation fails.
 * For server-side trust boundaries where invalid data is a programming error.
 *
 * @throws {ZodError} if parsing fails
 */
export function parseOrThrow<T>(schema: z.ZodSchema<T>, value: unknown): T {
  return schema.parse(value);
}

/**
 * Parses a value against a Zod schema and returns an ActionResult.
 * Prefer this at external trust boundaries (form inputs, API payloads).
 */
export function parseResult<T>(schema: z.ZodSchema<T>, value: unknown): ActionResult<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return ok(result.data);
  }
  const message = result.error.errors.map((e) => e.message).join('; ');
  return fail(message, 'VALIDATION_ERROR');
}
