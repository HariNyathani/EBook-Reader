/**
 * Book details loading skeleton.
 */
export default function BookDetailsLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* Breadcrumb skeleton */}
      <div className="mb-6">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
      </div>

      <div className="grid gap-8 md:grid-cols-[300px_1fr]">
        {/* Cover skeleton */}
        <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-gray-200" />

        {/* Metadata skeleton */}
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="h-9 w-3/4 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-6 w-1/2 animate-pulse rounded-lg bg-gray-200" />
          </div>

          <div className="flex items-center gap-3">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-gray-200" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="h-12 flex-1 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-12 w-32 animate-pulse rounded-lg bg-gray-200" />
          </div>

          <div className="space-y-3 border-t border-gray-200 pt-6">
            <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-36 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
