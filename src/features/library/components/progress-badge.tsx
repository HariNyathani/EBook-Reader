interface ProgressBadgeProps {
  percentage: number;
}

/**
 * Displays reading progress as a percentage badge.
 * Shows "Not started" for 0% progress.
 */
export function ProgressBadge({ percentage }: ProgressBadgeProps) {
  if (percentage === 0) {
    return (
      <span className="glass-inset inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-gray-600">
        Not started
      </span>
    );
  }

  const colorClass =
    percentage === 100
      ? 'bg-green-500/15 text-green-800 ring-green-500/25'
      : percentage >= 50
        ? 'bg-accent/15 text-blue-800 ring-accent/25'
        : 'bg-amber-500/15 text-amber-800 ring-amber-500/25';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 backdrop-blur-md ${colorClass}`}
    >
      {Math.round(percentage)}%
    </span>
  );
}
