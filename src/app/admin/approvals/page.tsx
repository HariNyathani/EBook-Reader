import { ApprovalsTable } from '@/features/admin/components/approvals-table';
import { Suspense } from 'react';

export const metadata = {
  title: 'User Approvals — Admin — EPUB Reader',
  description: 'Approve or reject user access requests.',
};

/**
 * Admin approvals page — lists users awaiting approval.
 * Protected by admin/layout.tsx (requireAdmin() guard).
 */
export default function ApprovalsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Approvals</h1>
        <p className="mt-1 text-sm text-gray-500">
          Approve new users to grant them access to the reading library.
        </p>
      </div>

      <Suspense fallback={<p className="text-sm text-gray-400">Loading pending approvals…</p>}>
        <ApprovalsTable />
      </Suspense>

      <div className="mt-6 rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <strong>Note:</strong> Approved users will gain access on their next sign-in or token
        refresh. Approval is not immediate.
      </div>
    </div>
  );
}
