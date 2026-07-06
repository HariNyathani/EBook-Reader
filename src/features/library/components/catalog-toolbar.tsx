'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SORTS, type SortOption } from '../constants';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Search } from 'lucide-react';

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
    params.set('page', '1');
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  function handleSort(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', value);
    params.set('page', '1');
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  const sortTabs = SORTS.map(sort => ({
    id: sort,
    label: sort.charAt(0).toUpperCase() + sort.slice(1)
  }));

  return (
    <div className="sticky top-20 z-20 mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-2 rounded-3xl liquid-glass">
      <div className="relative flex-1 max-w-md ml-1">
        <label htmlFor="search" className="sr-only">Search books</label>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3.5 text-gray-400">
          <Search className="h-4 w-4" />
        </div>
        <input
          id="search"
          type="search"
          placeholder="Search catalog..."
          defaultValue={currentQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="glass-inset w-full rounded-full pl-10 pr-4 py-2 text-sm focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
          aria-busy={isPending}
        />
      </div>
      <div className="flex items-center gap-3 pr-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:inline-block">Sort</span>
        <LiquidTabs 
          tabs={sortTabs}
          activeTab={currentSort}
          onChange={handleSort}
        />
      </div>
    </div>
  );
}
