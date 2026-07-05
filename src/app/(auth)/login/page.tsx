import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/components/login-form';

interface LoginPageProps {
  searchParams: Promise<{ redirectTo?: string }>;
}

export const metadata = {
  title: 'Sign In — EPUB Reader',
  description: 'Sign in to your private EPUB Reader account.',
};

/**
 * Login page — presents the LoginForm with an optional redirectTo parameter.
 * Middleware and (auth)/layout already redirect authenticated users away.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirectTo } = await searchParams;

  // Sanitize redirectTo: must be a same-origin path (starts with '/', not '//')
  const safeRedirectTo =
    redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')
      ? redirectTo
      : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white px-8 py-10 shadow-md ring-1 ring-gray-200">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <span className="text-3xl" aria-hidden="true">
            📚
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your reading library</p>
        </div>

        <Suspense>
          <LoginForm redirectTo={safeRedirectTo} />
        </Suspense>
      </div>
    </main>
  );
}
