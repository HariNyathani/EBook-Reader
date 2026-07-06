'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUpAction } from '@/features/auth/actions';
import type { ActionResult } from '@/lib/result';
import { ROUTES } from '@/lib/routes';

const initialState: ActionResult = { status: 'success' };

/**
 * Registration form — bound to signUpAction via useActionState.
 * On success, redirects to /pending-approval (account awaits admin approval).
 */
export function RegisterForm() {
  const router = useRouter();

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData): Promise<ActionResult> => {
      const result = await signUpAction(formData);
      if (result.status === 'success') {
        router.push(ROUTES.PENDING_APPROVAL);
      }
      return result;
    },
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {/* Global error */}
      {state.status === 'error' && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200/60 bg-red-50/70 px-4 py-3 text-sm font-medium text-red-700 backdrop-blur-md"
        >
          {state.message}
        </div>
      )}

      {/* Success notice (while redirect is pending) */}
      {state.status === 'success' && state.data === undefined && isPending === false && (
        <div
          role="status"
          className="rounded-2xl border border-green-200/60 bg-green-50/70 px-4 py-3 text-sm font-medium text-green-700 backdrop-blur-md"
        >
          Account created! Redirecting…
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="register-email" className="text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          className="glass-inset rounded-2xl px-4 py-2.5 text-sm placeholder:text-gray-400 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="register-password" className="text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={isPending}
          className="glass-inset rounded-2xl px-4 py-2.5 text-sm placeholder:text-gray-400 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="At least 8 characters"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="accent-gradient mt-1 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-accent-glow transition-all hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Creating account…' : 'Create account'}
      </button>

      <p className="text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href={ROUTES.LOGIN} className="font-semibold text-accent hover:brightness-110">
          Sign in
        </Link>
      </p>
    </form>
  );
}
