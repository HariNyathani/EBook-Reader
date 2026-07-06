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
      {/* Cover area — glossy glass slab with a specular sweep on hover */}
      <div className="gloss-sweep relative aspect-[2/3] w-full rounded-2xl overflow-hidden shadow-book group-hover:shadow-book-hover transition-shadow duration-300">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt={`Cover of ${title}`} className="h-full w-full object-cover" />
        ) : (
          <div className="glass-panel flex h-full w-full items-center justify-center p-4 text-center text-xs text-gray-400">
            No cover
          </div>
        )}

        {/* Glass edge: hairline ring + specular top highlight for depth */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/25" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/50" />

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
            className="glass-panel w-full rounded-full px-3 py-1.5 text-xs font-semibold text-gray-700 transition-all hover:bg-white/80 hover:text-gray-900 hover:shadow-glass-hover active:scale-[0.98]"
          >
            Open
          </button>
        </div>
      )}
    </motion.article>
  );
}
