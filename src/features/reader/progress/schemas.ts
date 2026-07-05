/**
 * Progress validation schemas (ISD §10.R).
 *
 * Used by both the Server Action and the beacon endpoint (both server-side).
 * Server-side validation ensures we never trust client input.
 *
 * This is a pure, dependency-free Zod module — NO 'use client' directive.
 * It is imported by server-only modules (`actions.ts`, `route.ts`). Marking it
 * 'use client' would turn its exports into client references in the server
 * graph, so `progressSchema.safeParse(...)` could resolve to a proxy instead of
 * the schema and silently break the critical progress-write path. Kept as a
 * shared module (matches every other `schemas.ts` in the repo).
 */

import { z } from 'zod';

/**
 * Progress input schema.
 *
 * Fields:
 * - bookId: UUID of the book
 * - cfi: EPUB CFI string (current reading position)
 * - percentage: Reading progress (0-100)
 * - updatedAt: ISO timestamp (for multi-device conflict resolution)
 *
 * ISD §10.F: updatedAt is used for last-write-wins conflict resolution.
 */
export const progressSchema = z.object({
  bookId: z.string().uuid(),
  cfi: z.string().max(4096), // CFI length cap (ISD §10.Z)
  percentage: z.number().min(0).max(100),
  updatedAt: z.string().datetime(),
});

export type ProgressInput = z.infer<typeof progressSchema>;

/**
 * Reading session schema (ISD §10.I).
 *
 * Fields:
 * - bookId: UUID of the book
 * - startedAt: ISO timestamp when session began
 * - endedAt: ISO timestamp when session ended
 * - durationSeconds: Session duration (must be >= 0)
 */
export const sessionSchema = z.object({
  bookId: z.string().uuid(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(0),
});

export type SessionInput = z.infer<typeof sessionSchema>;
