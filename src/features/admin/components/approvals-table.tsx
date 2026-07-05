import { createAdminClient } from '@/lib/supabase/admin';
import { setUserApprovalAction } from '@/features/admin/actions';

/**
 * Server component — renders a table of unapproved users with approve/revoke buttons.
 * Uses the admin (service-role) client to read profiles (bypasses RLS — caller must be admin).
 * Called only from admin/approvals/page.tsx, which is already guarded by requireAdmin().
 */
export async function ApprovalsTable() {
  const admin = createAdminClient();

  const { data: unapprovedProfiles, error } = await admin
    .from('profiles')
    .select('id, email, is_approved, is_admin, created_at')
    .eq('is_approved', false)
    .order('created_at', { ascending: true });

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        Failed to load pending approvals. Please refresh.
      </div>
    );
  }

  if (!unapprovedProfiles || unapprovedProfiles.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No pending approval requests. All registered users are approved.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Registered</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {unapprovedProfiles.map((profile) => (
            <tr key={profile.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-900">{profile.email}</td>
              <td className="px-4 py-3 text-gray-500">
                {new Date(profile.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <form
                  action={async () => {
                    'use server';
                    await setUserApprovalAction({ userId: profile.id, approve: true });
                  }}
                >
                  <button
                    type="submit"
                    id={`approve-btn-${profile.id}`}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    Approve
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
