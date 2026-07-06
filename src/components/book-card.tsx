import { cn } from '@/lib/utils/cn';
import { motion } from 'framer-motion';

interface BookCardProps {
  title: string;
  author: string | null;
  coverSrc?: string;
  onOpen?: () => void;
  className?: string;
  availableOffline?: boolean;
  coverOverlay?: React.ReactNode;
}

/**
 * Premium glassmorphic book card component using Framer Motion.
 */
export function BookCard({
  title,
  author,
  coverSrc,
  onOpen,
  className,
  availableOffline = false,
  coverOverlay,
}: BookCardProps) {
  return (
    <motion.article
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={cn(
        'group flex flex-col overflow-visible',
        className,
      )}
    >
      {/* Cover area */}
      <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden shadow-book group-hover:shadow-book-hover transition-shadow duration-300">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt={`Cover of ${title}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-100 p-4 text-center text-xs text-gray-400">
            No cover
          </div>
        )}
        
        {/* Soft inner shadow for depth */}
        <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-xl pointer-events-none" />

        {availableOffline && (
          <div
            className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
            aria-label="Available offline"
            title="Available offline"
          >
            <span aria-hidden="true">✓</span>
            <span>Offline</span>
          </div>
        )}

        {/* Custom overlay passed by parent (e.g. hover action buttons) */}
        {coverOverlay}
      </div>

      {/* Metadata */}
      <div className="flex flex-col gap-0.5 pt-3 pb-1 px-1">
        <h2 className="line-clamp-2 text-sm font-bold leading-tight text-gray-900">{title}</h2>
        {author && <p className="text-gray-500 line-clamp-1 text-xs font-medium">{author}</p>}
      </div>

      {/* Action */}
      {onOpen && (
        <div className="pt-2 px-1">
          <button
            onClick={onOpen}
            className="w-full rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200"
          >
            Open
          </button>
        </div>
      )}
    </motion.article>
  );
}
