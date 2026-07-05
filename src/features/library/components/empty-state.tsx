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
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white py-16 text-center">
      <span className="text-5xl" aria-hidden="true">
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-semibold text-gray-700">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-gray-500">{description}</p>
    </div>
  );
}
