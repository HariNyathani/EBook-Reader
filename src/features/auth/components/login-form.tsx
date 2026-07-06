'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction } from '@/features/auth/actions';
import type { ActionResult } from '@/lib/result';
import { ROUTES } from '@/lib/routes';

const initialState: ActionResult = { status: 'success' };

interface LoginFormProps {
  /** Safe, same-origin redirectTo path to forward after successful login. */
  redirectTo?: string;
}

/**
 * Login form — bound to signInAction via useActionState.
 * Progressive-enhancement friendly (works without JS on first load).
 * Error messages are rendered inline from the ActionResult.
 */
export function LoginForm({ redirectTo }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      return signInAction(formData, redirectTo);
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="login-email"
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
        <label htmlFor="login-password" className="text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          className="glass-inset rounded-2xl px-4 py-2.5 text-sm placeholder:text-gray-400 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="accent-gradient mt-1 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-accent-glow transition-all hover:brightness-110 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-sm text-gray-500">
        No account?{' '}
        <Link href={ROUTES.REGISTER} className="font-semibold text-accent hover:brightness-110">
          Create one
        </Link>
      </p>
    </form>
  );
}
