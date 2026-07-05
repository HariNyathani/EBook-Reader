/**
 * Dashboard loading skeleton — grid of placeholder book cards.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-4 w-96 animate-pulse rounded-lg bg-gray-200" />
      </div>

      {/* Catalog skeleton */}
      <section className="space-y-4">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-gray-200" />

        {/* Toolbar skeleton */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-10 flex-1 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-200" />
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-3">
              {/* Cover skeleton */}
              <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-gray-200" />
              {/* Title skeleton */}
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
              {/* Author skeleton */}
              <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
