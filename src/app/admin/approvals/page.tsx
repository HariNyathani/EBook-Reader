import { redirect } from 'next/navigation';

/**
 * Admin approvals page — Phase 4 route.
 * Phase 5 redirects to the unified /admin/users page with pending filter.
 * Preserves backward compatibility for any bookmarked links.
 */
export default function ApprovalsPage() {
  redirect('/admin/users?status=pending');
}
