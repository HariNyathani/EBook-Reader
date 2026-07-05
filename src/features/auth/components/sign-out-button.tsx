'use client';

import { signOutAction } from '@/features/auth/actions';
import { performSignOut } from '@/features/offline/use-sign-out-cleanup';

interface SignOutButtonProps {
  className?: string;
}

/**
 * Sign-out button — performs client-side cleanup (offline books +
 * progress queue) before calling the Server Action that clears the
 * Supabase session cookie and redirects to /login.
 *
 * The split is necessary because Server Actions cannot access
 * IndexedDB (ISD §13.H, §13.Z). The `performSignOut` helper:
 *   1. Dispatches the `auth:sign-out` event (the useSignOutCleanup
 *      hook in (app)/layout listens and runs the async cleanup).
 *   2. Awaits the Server Action (which clears the cookie + redirects).
 *
 * If the Server Action fails, the next mount of the (app) layout
 * will see an unauthenticated user and the middleware will redirect
 * to /login — the cleanup either already happened or runs lazily.
 */
export function SignOutButton({ className }: SignOutButtonProps) {
  return (
    <form
      action={async () => {
        await performSignOut(signOutAction);
      }}
    >
      <button
        id="sign-out-btn"
        type="submit"
        className={
          className ??
          'rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900'
        }
      >
        Sign out
      </button>
    </form>
  );
}
