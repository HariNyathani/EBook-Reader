'use client';

import { signOutAction } from '@/features/auth/actions';

interface SignOutButtonProps {
  className?: string;
}

/**
 * Sign-out button — calls signOutAction on click.
 * Client component because it drives a user interaction.
 * The action redirects to /login after clearing the session cookie.
 */
export function SignOutButton({ className }: SignOutButtonProps) {
  return (
    <form
      action={async () => {
        await signOutAction();
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
