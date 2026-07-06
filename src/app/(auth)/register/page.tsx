import { RegisterForm } from '@/features/auth/components/register-form';

export const metadata = {
  title: 'Create Account — EPUB Reader',
  description: 'Create a new account to access the private EPUB Reader library.',
};

/**
 * Registration page — presents the RegisterForm.
 * On successful registration, the form redirects to /pending-approval.
 * Middleware and (auth)/layout redirect already-authenticated users away.
 */
export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="liquid-glass w-full max-w-sm rounded-4xl px-8 py-10">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <span className="inline-block text-4xl drop-shadow-md" aria-hidden="true">
            📖
          </span>
          <h1 className="mt-4 bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            Create account
          </h1>
          <p className="mt-1 text-sm text-gray-500 font-medium">Request access to the reading library</p>
        </div>

        <RegisterForm />
      </div>
    </main>
  );
}
