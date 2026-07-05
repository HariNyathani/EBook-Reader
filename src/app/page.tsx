// Server Component — placeholder
// Phase 4 will add a real auth redirect to ROUTES.DASHBOARD once auth middleware exists.
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">EPUB Reader</h1>
      <p className="text-lg text-gray-600">Bootstrap complete.</p>
      <Link
        href={ROUTES.DASHBOARD}
        className="mt-2 rounded-md bg-foreground px-6 py-2 text-sm font-medium text-background hover:opacity-90"
      >
        Go to Library →
      </Link>
    </main>
  );
}
