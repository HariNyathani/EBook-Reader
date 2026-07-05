'use client';

/**
 * OfflineToggle — "Download for offline" / "Remove download" button
 * shown on the library BookCard and on the reader toolbar.
 *
 * Drives the use-offline-book hook (download/remove). Shows a
 * progress indicator while downloading and a tooltip with the
 * downloaded size. Renders nothing if the browser does not support
 * IndexedDB (graceful degradation).
 */

import { useState, useCallback } from 'react';
import { useOfflineBook } from '../use-offline-book';
import { useUiStore } from '@/store/ui-store';
import { useOfflineStore, selectStorageInfo } from '@/store/offline-store';
import { cn } from '@/lib/utils/cn';

interface OfflineToggleProps {
  bookId: string;
  title: string;
  author: string | null;
  /** Current user id (from session claims, never client-trusted). */
  userId: string;
  /** Optional smaller variant (used inside BookCard's overlay). */
  compact?: boolean;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function OfflineToggle({
  bookId,
  title,
  author,
  userId,
  compact = false,
  className,
}: OfflineToggleProps) {
  const { isDownloaded, meta, progress, download, remove } = useOfflineBook(bookId);
  const storageInfo = useOfflineStore(selectStorageInfo);
  const showToast = useUiStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  const onDownload = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await download({ bookId, title, author, userId });
      showToast(`"${title}" is available offline.`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed';
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, download, bookId, title, author, userId, showToast]);

  const onRemove = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await remove(userId);
      showToast(`"${title}" removed from offline storage.`, 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Remove failed';
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, remove, userId, title, showToast]);

  // Guard: if the browser does not support IndexedDB or persistent
  // download workflows, hide the toggle entirely. Online reading is
  // unaffected. Hooks are declared above; this early return is safe.
  if (typeof window !== 'undefined') {
    const hasIDB = typeof indexedDB !== 'undefined';
    if (!hasIDB) return null;
  }

  const isInProgress = progress !== undefined && progress < 1;
  const progressPct = progress !== undefined ? Math.round(progress * 100) : 0;

  const baseClasses = compact
    ? 'rounded-md border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2'
    : 'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2';

  if (isInProgress) {
    return (
      <button
        type="button"
        disabled
        aria-label={`Downloading ${title}, ${progressPct}% complete`}
        aria-busy="true"
        className={cn(baseClasses, 'border-blue-300 bg-blue-50 text-blue-800', className)}
      >
        <span aria-hidden="true">⏬ </span>
        {progressPct}%
      </button>
    );
  }

  if (isDownloaded) {
    return (
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove "${title}" from offline storage (${formatBytes(meta?.sizeBytes ?? 0)})`}
        title={`Available offline (${formatBytes(meta?.sizeBytes ?? 0)}). Click to remove.`}
        className={cn(
          baseClasses,
          'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
          className,
        )}
      >
        <span aria-hidden="true">✓ </span>
        {compact ? 'Offline' : 'Available offline'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={busy}
      aria-label={`Download "${title}" for offline reading`}
      title={
        storageInfo
          ? `Storage: ${formatBytes(storageInfo.usage)} of ${formatBytes(storageInfo.quota)} used`
          : 'Download for offline reading'
      }
      className={cn(
        baseClasses,
        'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
        className,
      )}
    >
      <span aria-hidden="true">⤓ </span>
      {compact ? 'Download' : 'Download for offline'}
    </button>
  );
}
