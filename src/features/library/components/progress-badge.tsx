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
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        Not started
      </span>
    );
  }

  const colorClass =
    percentage === 100
      ? 'bg-green-100 text-green-800'
      : percentage >= 50
        ? 'bg-blue-100 text-blue-800'
        : 'bg-yellow-100 text-yellow-800';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {Math.round(percentage)}%
    </span>
  );
}
