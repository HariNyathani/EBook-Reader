// Authenticated app shell layout — no auth guard yet (Phase 4 adds the guard).
// Phase 4 will wrap this with the Supabase session check and redirect unauthenticated users.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Phase 4: top nav / sidebar shell goes here */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
