'use client';

/**
 * Preferences sync (ISD §12.I, §12.W).
 *
 * Coordinates local-first persistence (handled by zustand `persist`
 * middleware in `reader-store`) with optional cloud sync (handled
 * here by `savePreferencesAction` and `getPreferences`).
 *
 * Lifecycle:
 *   - On mount (`hydratePreferences`): the local zustand store restores
 *     instantly from localStorage. We then fetch cloud preferences
 *     (via a thin Server Action wrapper — see below). If the cloud
 *     `updatedAt` is newer than local, we overwrite local. If local is
 *     newer, we push to cloud. If the user is offline, we keep local.
 *   - On changes (`schedulePush`): we subscribe to the durable
 *     preference slice and debounce (PREFERENCES_DEBOUNCE_MS) before
 *     pushing to cloud. We track the "local" `updatedAt` in a ref so we
 *     can avoid pushing on hydration (the cloud value is already
 *     authoritative).
 *
 * The cloud fetch is performed via a small Server Action bridge rather
 * than a GET endpoint, because Server Actions are the canonical way to
 * call the server from a client component in Next.js 15 App Router. The
 * action is `getPreferencesAction` (a thin wrapper over `getPreferences`
 * that returns a plain JSON-friendly object).
 */

import { useEffect, useRef } from 'react';
import { useReaderStore } from '@/store/reader-store';
import { savePreferencesAction, type SavePreferencesInput } from './actions';
import { getPreferencesAction } from './get-preferences-action';
import { DEFAULT_READER_PREFERENCES, type ReaderPreferences } from './schema';

/**
 * Time to wait after a change before pushing to the cloud.
 * Phase 12 §12.L: ~1s, to coalesce slider drags.
 */
const PREFERENCES_DEBOUNCE_MS = 1000;

/**
 * The list of fields that constitute the durable preference slice.
 * Used to compare "did the slice change?" before pushing.
 */
const PREFERENCE_KEYS: ReadonlyArray<keyof ReaderPreferences> = [
  'theme',
  'fontFamily',
  'fontSize',
  'lineHeight',
  'margin',
  'textAlign',
  'columns',
];

/**
 * Read the current reader-preference slice as a plain object.
 * Re-orders keys for stable serialisation.
 */
export function snapshotPreferences(state: {
  theme: 'light' | 'sepia' | 'dark';
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  margin: number;
  textAlign: 'start' | 'justify';
  columns: 'auto' | '1' | '2';
}): ReaderPreferences {
  return {
    theme: state.theme,
    fontFamily: state.fontFamily,
    fontSize: state.fontSize,
    lineHeight: state.lineHeight,
    margin: state.margin,
    textAlign: state.textAlign,
    columns: state.columns,
  };
}

/**
 * Compare two preference snapshots for equality. Used to short-circuit
 * redundant pushes.
 */
function prefsEqual(a: ReaderPreferences, b: ReaderPreferences): boolean {
  for (const key of PREFERENCE_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * usePreferencesSync — wires local store to cloud sync.
 *
 * On mount: hydrate from cloud (if newer than local).
 * On change: debounce + push to cloud.
 *
 * The hook is mounted once at the app layout level (see
 * `PreferencesProvider`).
 */
export function usePreferencesSync(): void {
  // Refs for the latest snapshot, last-pushed snapshot, and a flag to
  // mark "hydrated" so the first change after mount is treated as user
  // intent (and pushed).
  const lastPushedRef = useRef<ReaderPreferences | null>(null);
  const hasHydratedRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 1. Hydrate from cloud on mount.
    let cancelled = false;
    void (async () => {
      try {
        const cloud = await getPreferencesAction();
        if (cancelled) return;
        const local = snapshotPreferences(useReaderStore.getState());
        const localTime = hasLocalTimestamp() ? new Date(getLocalTimestamp()!).getTime() : 0;

        let adoptedCloud = false;
        if (cloud) {
          const cloudTime = new Date(cloud.updatedAt).getTime();
          // Cloud wins when it is strictly newer, or when this device has
          // no local sync record at all (fresh device / cleared storage).
          const cloudIsAuthoritative = cloudTime > localTime || localTime === 0;
          if (cloudIsAuthoritative && !prefsEqual(cloud.reader, local)) {
            applyCloudToStore(cloud.reader);
            adoptedCloud = true;
          }
        }

        // Track what we just reconciled so the change-subscription doesn't
        // immediately re-push the value we just observed.
        lastPushedRef.current = snapshotPreferences(useReaderStore.getState());

        // If we did NOT adopt the cloud value and the local slice differs
        // from what the cloud holds, the local copy is newer/dirty (e.g. a
        // change made offline, which never updated the local sync
        // timestamp). Push it so the cloud converges — ISD §12.I: "if local
        // is newer/dirty, push via savePreferencesAction". `doPush` no-ops
        // when offline, so this safely retries on the next change/online.
        if (!adoptedCloud) {
          const cloudReader = cloud?.reader ?? DEFAULT_READER_PREFERENCES;
          const localNow = snapshotPreferences(useReaderStore.getState());
          if (!prefsEqual(localNow, cloudReader)) {
            void doPush();
          }
        }
      } catch (err) {
        // Cloud fetch failed — keep local. Will retry on next change.
        console.warn('[usePreferencesSync] cloud fetch failed:', err);
      } finally {
        hasHydratedRef.current = true;
      }
    })();

    // 2. Subscribe to the durable preference slice.
    const unsub = useReaderStore.subscribe((state, prev) => {
      // Only consider durable preference fields.
      const current = snapshotPreferences(state);
      const previous = snapshotPreferences(prev);
      if (prefsEqual(current, previous)) return;
      // Wait until the initial hydration has finished so we don't push
      // the local value over a fresher cloud value.
      if (!hasHydratedRef.current) return;
      // If the change matches what we just pushed, ignore.
      if (lastPushedRef.current && prefsEqual(current, lastPushedRef.current)) {
        return;
      }
      schedulePush();
    });

    return () => {
      cancelled = true;
      unsub();
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };

    function schedulePush(): void {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      pushTimerRef.current = setTimeout(() => {
        void doPush();
      }, PREFERENCES_DEBOUNCE_MS);
    }

    async function doPush(): Promise<void> {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // Offline — keep local. Will retry on `online` event.
        return;
      }
      const snapshot = snapshotPreferences(useReaderStore.getState());
      const input: SavePreferencesInput = {
        preferences: { version: 1, reader: snapshot },
        updatedAt: new Date().toISOString(),
      };
      const result = await savePreferencesAction(input);
      if (result.status === 'success' && result.data) {
        lastPushedRef.current = snapshot;
        setLocalTimestamp(result.data.storedAt);
      } else if (result.status === 'error') {
        console.warn('[usePreferencesSync] save failed:', result.message);
      }
    }
  }, []);
}

/**
 * Apply a cloud reader-preference slice to the local store.
 * Each setter is called individually so the live engine pipeline sees
 * the changes (theme updates the engine's bg/fg, font updates re-inject
 * CSS variables, etc.).
 */
function applyCloudToStore(reader: ReaderPreferences): void {
  const store = useReaderStore.getState();
  if (store.theme !== reader.theme) store.setTheme(reader.theme);
  if (store.fontFamily !== reader.fontFamily) store.setFontFamily(reader.fontFamily);
  if (store.fontSize !== reader.fontSize) store.setFontSize(reader.fontSize);
  if (store.lineHeight !== reader.lineHeight) store.setLineHeight(reader.lineHeight);
  if (store.margin !== reader.margin) store.setMargin(reader.margin);
  if (store.textAlign !== reader.textAlign) store.setTextAlign(reader.textAlign);
  if (store.columns !== reader.columns) store.setColumns(reader.columns);
}

// ---------------------------------------------------------------------------
// Local "lastUpdated" timestamp.
//
// We keep a small "lastUpdated" in a separate localStorage key so the
// sync hook can decide which side (local vs cloud) is newer. This is
// intentionally not part of the persisted reader-preference slice (it
// is internal sync metadata, not a user-visible preference).
// ---------------------------------------------------------------------------

const LOCAL_TS_KEY = 'reader-preferences:last-updated';

function hasLocalTimestamp(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(LOCAL_TS_KEY) !== null;
}

function getLocalTimestamp(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LOCAL_TS_KEY);
}

function setLocalTimestamp(ts: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_TS_KEY, ts);
  } catch {
    // localStorage may be full or disabled — fail silently.
  }
}
