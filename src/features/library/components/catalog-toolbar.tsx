'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SORTS, type SortOption } from '../constants';

/**
 * Client component for catalog search and sort controls.
 * URL-driven: updates searchParams without client state.
 */
export function CatalogToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentQuery = searchParams.get('query') ?? '';
  const currentSort = (searchParams.get('sort') as SortOption) ?? 'recent';

  function handleSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      params.set('query', value.trim());
    } else {
      params.delete('query');
    }
    params.set('page', '1'); // Reset to first page on search
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  function handleSort(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', value);
    params.set('page', '1'); // Reset to first page on sort change
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1">
        <label htmlFor="search" className="sr-only">
          Search books
        </label>
        <input
          id="search"
          type="search"
          placeholder="Search by title or author..."
          defaultValue={currentQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-busy={isPending}
        />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="sort" className="text-sm font-medium text-gray-700">
          Sort by:
        </label>
        <select
          id="sort"
          value={currentSort}
          onChange={(e) => handleSort(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-busy={isPending}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {sort.charAt(0).toUpperCase() + sort.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
