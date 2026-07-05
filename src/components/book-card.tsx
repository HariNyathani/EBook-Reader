import { cn } from '@/lib/utils/cn';

interface BookCardProps {
  title: string;
  author: string | null;
  /**
   * Optional cover image URL.
   * Phase 2 will supply this from the /api/covers/[id] route handler.
   * If absent, a neutral placeholder is rendered.
   */
  coverSrc?: string;
  onOpen?: () => void;
  className?: string;
  /**
   * Phase 13: when true, renders a small "Available offline" badge
   * over the cover (the book has been downloaded by the current user
   * via the offline book store).
   */
  availableOffline?: boolean;
}

/**
 * Presentational book card component.
 * No data fetching — all data passed as props.
 * Phase 5+ will wire this to real library data.
 */
export function BookCard({
  title,
  author,
  coverSrc,
  onOpen,
  className,
  availableOffline = false,
}: BookCardProps) {
  return (
    <article
      className={cn(
        'border-foreground/10 flex flex-col overflow-hidden rounded-lg border',
        'bg-foreground/5 shadow-sm transition-shadow hover:shadow-md',
        className,
      )}
    >
      {/* Cover area */}
      <div className="bg-foreground/10 relative aspect-[2/3] w-full">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt={`Cover of ${title}`} className="h-full w-full object-cover" />
        ) : (
          <div className="text-foreground/40 flex h-full w-full items-center justify-center p-4 text-center text-xs">
            No cover
          </div>
        )}
        {availableOffline && (
          <div
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            aria-label="Available offline"
            title="Available offline"
          >
            <span aria-hidden="true">✓</span>
            <span>Offline</span>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h2 className="line-clamp-2 text-sm font-semibold leading-tight">{title}</h2>
        {author && <p className="text-foreground/60 line-clamp-1 text-xs">{author}</p>}
      </div>

      {/* Action */}
      {onOpen && (
        <div className="border-foreground/10 border-t p-3">
          <button
            onClick={onOpen}
            className="hover:bg-foreground/10 w-full rounded px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Open
          </button>
        </div>
      )}
    </article>
  );
}
