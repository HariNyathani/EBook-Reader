interface EmptyStateProps {
  title: string;
  description: string;
  icon?: string;
}

/**
 * Reusable empty state component.
 * Displays a centered message with optional icon.
 */
export function EmptyState({ title, description, icon = '📭' }: EmptyStateProps) {
  return (
    <div className="glass-panel flex flex-col items-center justify-center rounded-3xl py-16 text-center">
      <span className="text-5xl drop-shadow-sm" aria-hidden="true">
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-bold tracking-tight text-gray-800">{title}</h3>
      <p className="mt-2 max-w-md text-sm font-medium text-gray-500">{description}</p>
    </div>
  );
}
