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
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="liquid-glass w-full max-w-sm rounded-4xl px-8 py-10">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <span className="inline-block text-4xl drop-shadow-md" aria-hidden="true">
            📖
          </span>
          <h1 className="mt-4 bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            Welcome to Librea
          </h1>
          <p className="mt-1 text-sm text-gray-500 font-medium">Sign in to your reading library</p>
        </div>

        <Suspense>
          <LoginForm redirectTo={safeRedirectTo} />
        </Suspense>
      </div>
    </main>
  );
}
