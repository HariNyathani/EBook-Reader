'use server';

/**
 * getPreferencesAction — thin Server Action wrapper around `getPreferences`.
 *
 * Why a Server Action (vs. a Route Handler)? The client uses the
 * standard Server Action RPC; no new endpoint to maintain, RLS is
 * enforced by the request-scoped server client, and the action is
 * colocated with the rest of the preferences feature.
 *
 * The function returns a plain serializable object (or null) so it
 * passes through Next.js's Server Action serialization without trouble.
 */

import { getPreferences } from './queries';

export async function getPreferencesAction() {
  return await getPreferences();
}
