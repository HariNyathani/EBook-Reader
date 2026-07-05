// Admin shell layout — no auth guard yet (Phase 4 adds the is_admin guard).
// Phase 4 will wrap this with an admin-claim check and redirect non-admins.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Phase 4: admin sidebar / header goes here */}
      <header className="border-foreground/10 border-b px-6 py-3">
        <span className="text-sm font-semibold">Admin Panel</span>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
