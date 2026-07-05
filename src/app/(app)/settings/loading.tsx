/**
 * Settings page loading skeleton.
 * Shown while the server component fetches the user profile.
 */
export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-96 animate-pulse rounded bg-gray-100" />
      </div>
      <div className="h-48 animate-pulse rounded-lg bg-gray-100" />
      <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
    </div>
  );
}
