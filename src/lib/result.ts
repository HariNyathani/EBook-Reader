/**
 * Standardized Server Action result contract.
 * All Server Actions in this application must return ActionResult<T>.
 *
 * Usage:
 *   import { ok, fail } from '@/lib/result';
 *
 *   async function myAction(): Promise<ActionResult<string>> {
 *     try {
 *       return ok('value');
 *     } catch (e) {
 *       return fail('Something went wrong', 'UNKNOWN_ERROR');
 *     }
 *   }
 *
 * This module is pure and dependency-free — safe to import from client or server.
 */

/** The canonical result shape for all Server Actions. */
export type ActionResult<T = undefined> =
  { status: 'success'; data?: T } | { status: 'error'; message: string; code?: string };

/**
 * Constructs a successful ActionResult.
 * @param data - Optional payload to return on success.
 */
export function ok<T>(data?: T): ActionResult<T> {
  return { status: 'success', data };
}

/**
 * Constructs an error ActionResult.
 * @param message - Human-readable error message (may be shown in UI).
 * @param code - Optional machine-readable error code for programmatic handling.
 */
export function fail(message: string, code?: string): ActionResult<never> {
  return { status: 'error', message, code };
}
