'use client';

/**
 * SettingsForm — editable view of the reader preferences (ISD §12.I).
 *
 * Renders the same typography and theme controls as the in-reader
 * popovers (which is the "Phase 11 control semantics" the spec calls
 * for — same components, same live updates). Adds a "Reset to defaults"
 * action and a Phase 13 "Offline" section showing downloads + storage.
 *
 * Changes flow through the standard reader-store setters, which means:
 *   1. The change is immediately live-applied to the engine via the
 *      useReaderEngine `setStyles` pipeline.
 *   2. The change is persisted to localStorage by zustand `persist`.
 *   3. The change is debounced + pushed to the cloud by the
 *      `usePreferencesSync` hook (mounted in the layout).
 *
 * The account info and sign-out surface lives in the (app) layout
 * header, so this form focuses on preferences.
 */

import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/reader-store';
import { TypographyPanel } from '@/features/reader/components/typography-panel';
import { ThemeSwitcher } from '@/features/reader/components/theme-switcher';
import { DEFAULT_READER_PREFERENCES } from '../schema';
import { useOfflineStore, selectStorageInfo } from '@/store/offline-store';
import { getStorageInfo, requestPersistent, type StorageInfo } from '@/features/offline/storage';
import { useUiStore } from '@/store/ui-store';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function SettingsForm() {
  const setTheme = useReaderStore((s) => s.setTheme);
  const setFontFamily = useReaderStore((s) => s.setFontFamily);
  const setFontSize = useReaderStore((s) => s.setFontSize);
  const setLineHeight = useReaderStore((s) => s.setLineHeight);
  const setMargin = useReaderStore((s) => s.setMargin);
  const setTextAlign = useReaderStore((s) => s.setTextAlign);

  const onReset = () => {
    setTheme(DEFAULT_READER_PREFERENCES.theme);
    setFontFamily(DEFAULT_READER_PREFERENCES.fontFamily);
    setFontSize(DEFAULT_READER_PREFERENCES.fontSize);
    setLineHeight(DEFAULT_READER_PREFERENCES.lineHeight);
    setMargin(DEFAULT_READER_PREFERENCES.margin);
    setTextAlign(DEFAULT_READER_PREFERENCES.textAlign);
  };

  // Offline section state
  const offlineBooks = useOfflineStore((s) => s.offlineBooks);
  const storageInfo = useOfflineStore(selectStorageInfo);
  const showToast = useUiStore((s) => s.showToast);
  const [requestingPersist, setRequestingPersist] = useState(false);
  const [info, setInfo] = useState<StorageInfo | null>(null);

  // Refresh the storage info on mount + when the offlineBooks list changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fresh = await getStorageInfo();
      if (!cancelled) setInfo(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, [offlineBooks, storageInfo]);

  const onRequestPersistent = async () => {
    setRequestingPersist(true);
    try {
      const granted = await requestPersistent();
      if (granted) {
        showToast(
          'Persistent storage granted — your downloads are safe from auto-eviction.',
          'success',
        );
      } else {
        showToast(
          'Browser did not grant persistent storage. Downloads remain at risk of eviction under pressure.',
          'warning',
        );
      }
      const fresh = await getStorageInfo();
      if (fresh) setInfo(fresh);
    } finally {
      setRequestingPersist(false);
    }
  };

  const offlineCount = Object.keys(offlineBooks).length;
  const offlineTotalBytes = Object.values(offlineBooks).reduce((acc, b) => acc + b.sizeBytes, 0);
  const displayInfo = info ?? storageInfo;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Theme</h2>
            <p className="text-sm text-gray-500">
              Choose a reading theme. Applied instantly to the reader.
            </p>
          </div>
        </header>
        <ThemeSwitcher />
      </section>

      <section className="space-y-3">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Typography</h2>
            <p className="text-sm text-gray-500">
              Adjust font, size, line height, margins, and alignment.
            </p>
          </div>
        </header>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <TypographyPanel />
        </div>
      </section>

      <section className="space-y-3 border-t border-gray-200 pt-6">
        <header>
          <h2 className="text-lg font-semibold text-gray-900">Offline</h2>
          <p className="text-sm text-gray-500">
            Manage your offline downloads. Book bytes are stored in your browser&apos;s IndexedDB,
            scoped to your account, and purged on sign-out.
          </p>
        </header>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">Downloads</dt>
              <dd className="mt-1 font-semibold text-gray-900">{offlineCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">Offline size</dt>
              <dd className="mt-1 font-semibold text-gray-900">{formatBytes(offlineTotalBytes)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">Storage</dt>
              <dd className="mt-1 font-semibold text-gray-900">
                {displayInfo
                  ? `${formatBytes(displayInfo.usage)} / ${formatBytes(displayInfo.quota)} (${Math.round(displayInfo.fraction * 100)}%)`
                  : '—'}
              </dd>
            </div>
          </dl>

          {displayInfo && !displayInfo.persisted && (
            <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <p>
                Your browser may evict offline downloads under storage pressure. Request persistent
                storage to keep them safe.
              </p>
              <button
                type="button"
                onClick={onRequestPersistent}
                disabled={requestingPersist}
                className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
              >
                {requestingPersist ? 'Requesting…' : 'Request persistent storage'}
              </button>
            </div>
          )}

          {displayInfo?.persisted && (
            <p className="mt-3 text-xs text-emerald-700">
              ✓ Persistent storage is enabled. Your downloads are protected.
            </p>
          )}
        </div>
      </section>

      <section className="border-t border-gray-200 pt-6">
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Reset to defaults
        </button>
        <p className="mt-2 text-xs text-gray-500">
          Resets the theme and typography to the original defaults. Your reading position is not
          affected.
        </p>
      </section>
    </div>
  );
}
