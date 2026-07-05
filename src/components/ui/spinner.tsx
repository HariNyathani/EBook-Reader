import { cn } from '@/lib/utils/cn';

interface SpinnerProps {
  className?: string;
  size?: number;
  label?: string;
}

/**
 * Presentational SVG spinner for loading states.
 * Accessible via aria-label.
 */
export function Spinner({ className, size = 24, label = 'Loading…' }: SpinnerProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={label}
      role="status"
      className={cn('animate-spin', className)}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
