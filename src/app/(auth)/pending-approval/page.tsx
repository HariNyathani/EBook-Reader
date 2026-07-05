// Server Component — shown after registration, while admin approval is pending.
// Phase 4 will implement: polling or real-time status, sign-out button.
export default function PendingApprovalPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-bold">Pending Approval</h1>
      <p className="text-sm text-gray-500">
        Your account is awaiting administrator approval. You will be notified once access is
        granted.
      </p>
      <p className="text-xs text-gray-400">Full implementation — Phase 4</p>
    </main>
  );
}
