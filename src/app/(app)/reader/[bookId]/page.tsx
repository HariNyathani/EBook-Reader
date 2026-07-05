// Server Component — Reader placeholder
// Phase 5 will implement: Foliate iframe, CFI navigation, progress persistence.
interface ReaderPageProps {
  params: Promise<{ bookId: string }>;
}

export default async function ReaderPage({ params }: ReaderPageProps) {
  const { bookId } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold">Reader</h1>
      <p className="mt-2 text-sm text-gray-500">
        Book ID: <code className="bg-foreground/10 rounded px-1">{bookId}</code>
      </p>
      <p className="mt-1 text-xs text-gray-400">Foliate reader — Coming soon (Phase 5)</p>
    </main>
  );
}
