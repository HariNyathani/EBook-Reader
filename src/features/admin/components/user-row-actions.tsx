'use client';

import { useActionState, useEffect } from 'react';
import { setUserApprovalAction, setUserAdminAction } from '@/features/admin/actions';
import { useUiStore } from '@/store/ui-store';
import type { Profile } from '@/types';

interface UserRowActionsProps {
  user: Profile;
  currentUserId: string;
}

/**
 * Client component — renders approve/revoke and admin toggle buttons for a user row.
 * Wired to Server Actions via useActionState.
 */
export function UserRowActions({ user, currentUserId }: UserRowActionsProps) {
  const showToast = useUiStore((s) => s.showToast);

  // Approval action state
  const [approvalState, approvalAction, approvalPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const result = await setUserApprovalAction({
        userId: user.id,
        approve: formData.get('approve') === 'true',
      });
      return result;
    },
    null,
  );

  // Admin toggle action state
  const [adminState, adminAction, adminPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const result = await setUserAdminAction({
        userId: user.id,
        makeAdmin: formData.get('makeAdmin') === 'true',
      });
      return result;
    },
    null,
  );

  // Show toast on action result
  useEffect(() => {
    if (approvalState?.status === 'error') {
      showToast(approvalState.message, 'error');
    } else if (approvalState?.status === 'success') {
      showToast('User approval updated.', 'success');
    }
  }, [approvalState, showToast]);

  useEffect(() => {
    if (adminState?.status === 'error') {
      showToast(adminState.message, 'error');
    } else if (adminState?.status === 'success') {
      showToast('Admin status updated.', 'success');
    }
  }, [adminState, showToast]);

  const isSelf = user.id === currentUserId;

  return (
    <div className="flex gap-2">
      {/* Approval toggle */}
      <form action={approvalAction}>
        <input type="hidden" name="approve" value={user.is_approved ? 'false' : 'true'} />
        <button
          type="submit"
          disabled={approvalPending || (isSelf && user.is_approved)}
          className={`rounded px-3 py-1 text-xs font-semibold text-white shadow-sm transition-colors ${
            user.is_approved
              ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400'
              : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400'
          } disabled:cursor-not-allowed`}
          title={isSelf && user.is_approved ? 'You cannot revoke your own approval.' : undefined}
        >
          {approvalPending ? '…' : user.is_approved ? 'Revoke' : 'Approve'}
        </button>
      </form>

      {/* Admin toggle */}
      <form action={adminAction}>
        <input type="hidden" name="makeAdmin" value={user.is_admin ? 'false' : 'true'} />
        <button
          type="submit"
          disabled={adminPending || (isSelf && user.is_admin)}
          className={`rounded px-3 py-1 text-xs font-semibold text-white shadow-sm transition-colors ${
            user.is_admin
              ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
              : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
          } disabled:cursor-not-allowed`}
          title={isSelf && user.is_admin ? 'You cannot remove your own admin access.' : undefined}
        >
          {adminPending ? '…' : user.is_admin ? 'Demote' : 'Make Admin'}
        </button>
      </form>
    </div>
  );
}
