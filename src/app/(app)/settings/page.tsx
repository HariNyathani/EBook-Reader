import { Suspense } from 'react';
import { requireApproved } from '@/features/auth/session';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from '@/features/preferences/components/settings-form';
import { SignOutButton } from '@/features/auth/components/sign-out-button';

export const metadata = {
  title: 'Settings — EPUB Reader',
  description: 'Reader preferences and account settings.',
};

/**
 * Settings page (ISD §12.I, §12.M).
 *
 * Server component that:
 *   1. Calls `requireApproved()` to gate access.
 *   2. Loads the user's email from the profiles table (RLS-scoped to
 *      the user's own row).
 *   3. Renders the client-side `SettingsForm` (live-updating typography
 *      + theme controls) and account info + sign-out.
 */
export default async function SettingsPage() {
  const claims = await requireApproved();

  // Look up the email (used to show the user which account they're
  // signed in as). Profiles.email mirrors auth.users.email.
  let email: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', claims.userId)
      .maybeSingle();
    email = (data as { email?: string } | null)?.email ?? null;
  } catch {
    // Non-fatal — just show the user-id instead.
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="pt-2">
        <h1 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-500 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
          Settings
        </h1>
        <p className="mt-2 text-sm font-medium text-gray-500">
          Your reading preferences are saved instantly and synced across devices.
        </p>
      </header>

      {/* Account info */}
      <section className="glass-panel rounded-3xl p-6">
        <h2 className="text-lg font-bold tracking-tight text-gray-900">Account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Email</dt>
            <dd className="font-medium text-gray-900">{email ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">Role</dt>
            <dd className="font-medium text-gray-900">
              {claims.isAdmin ? 'Administrator' : 'Reader'}
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <SignOutButton className="glass-inset rounded-full px-5 py-2 text-sm font-semibold text-gray-700 transition-all hover:bg-white/80 hover:text-gray-900 active:scale-[0.98]" />
        </div>
      </section>

      {/* Reader preferences */}
      <section className="glass-panel rounded-3xl p-6">
        <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
          <SettingsForm />
        </Suspense>
      </section>
    </div>
  );
}
