'use client';

/**
 * ReaderProgressBar — bottom scrubber + position info (ISD §11.G, §11.M).
 *
 * Renders a draggable slider bound to `reader-store.fraction` and
 * displays the current percentage + chapter.
 *
 * Scrubbing:
 *   - Pointer-down starts a drag (the engine will emit `relocate`
 *     events as it navigates; we reflect them).
 *   - On pointer-up, we navigate the engine to the final fraction via
 *     `engine.goTo(fraction)`. The engine's `goTo` is documented as
 *     accepting a string (CFI / href / numeric fraction) — the
 *     underlying foliate-js `resolveNavigation` interprets it.
 *   - Keyboard: ←/→ step ±2%, Home/End go to start/end.
 *
 * The component is purely store + engine-API driven. No DOM injection
 * into the engine's iframe (SAD §5.1).
 *
 * Sync indicator: a small status dot is shown when the last save is in
 * flight or pending (Phase 10 hooks populate this).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReaderStore } from '@/store/reader-store';
import { useUiStore } from '@/store/ui-store';
import { cn } from '@/lib/utils/cn';

interface ReaderProgressBarProps {
  /** Engine navigation function (from useReaderEngine). */
  goTo: (target: string) => Promise<void>;
  /** Optional title/author shown to the right of the percentage. */
  bookTitle?: string | null;
}

export function ReaderProgressBar({ goTo, bookTitle }: ReaderProgressBarProps) {
  const fraction = useReaderStore((s) => s.fraction);
  const toc = useReaderStore((s) => s.toc);
  const activeChapterHref = useReaderStore((s) => s.activeChapterHref);
  const lastSavedAt = useReaderStore((s) => s.lastSavedAt);
  const syncState = useReaderStore((s) => s.syncState);
  const setChromeVisible = useUiStore((s) => s.setChromeVisible);

  // Local drag state. The slider is "controlled" by `fraction` from the
  // store except while dragging, in which case the user is the source of
  // truth until release.
  const [dragging, setDragging] = useState(false);
  const [draftFraction, setDraftFraction] = useState<number>(0);
  // After the user releases, hold the committed target visible until the
  // engine actually navigates there (goTo resolves + relocate lands).
  // Without this, releasing flips the thumb back to the stale store
  // `fraction` for the gap between release and navigation — the visible
  // "bounce back to the original position".
  const [pendingFraction, setPendingFraction] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Compute the active chapter label (best-effort: walk the TOC).
  const chapterLabel = (() => {
    if (!activeChapterHref || toc.length === 0) return null;
    function findLabel(items: typeof toc): string | null {
      for (const item of items) {
        if (item.href === activeChapterHref) return item.label;
        if (item.children) {
          const nested = findLabel(item.children);
          if (nested) return nested;
        }
      }
      return null;
    }
    return findLabel(toc);
  })();

  // Display priority: live drag > committed-but-not-yet-navigated target >
  // the store's reported position.
  const effectiveFraction = dragging ? draftFraction : (pendingFraction ?? fraction);
  const percentage = Math.max(0, Math.min(100, Math.round(effectiveFraction * 100)));

  const updateFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const next = rect.width === 0 ? 0 : x / rect.width;
    setDraftFraction(next);
  }, []);

  // Pointer interactions on the track.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      updateFromClientX(e.clientX);
    };
    const onUp = (e: PointerEvent) => {
      updateFromClientX(e.clientX);
      // Read the most recent draftFraction from the closure-friendly ref.
      const final = draftFractionRef.current;
      // Commit: stop dragging but KEEP showing the target (pendingFraction)
      // so the thumb doesn't snap back to the stale store value while the
      // engine navigates. Navigation is issued ONCE, here on release —
      // never during the drag — which also avoids the goTo race.
      setDragging(false);
      setPendingFraction(final);
      // foliate-js's `goTo` accepts a string CFI/href/fraction. The
      // fraction form is "0..1" — we pass the numeric string. Release the
      // visual hold only once navigation has settled (the relocate it
      // triggers has updated the store to the real landed position).
      Promise.resolve(goTo(String(final)))
        .catch((err) => console.error('[ReaderProgressBar] goTo failed:', err))
        .finally(() => setPendingFraction(null));
    };
    const onCancel = () => {
      setDragging(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    // We intentionally omit draftFraction from the deps; the ref keeps
    // the latest value in sync.
  }, [dragging, goTo, updateFromClientX]);

  // Mirror draftFraction into a ref so the pointerup handler always sees
  // the latest value without re-binding the effect.
  const draftFractionRef = useRef(draftFraction);
  useEffect(() => {
    draftFractionRef.current = draftFraction;
  }, [draftFraction]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setChromeVisible(true);
    setDragging(true);
    updateFromClientX(e.clientX);
    // Capture so the user can drag outside the track without losing the gesture.
    trackRef.current?.setPointerCapture?.(e.pointerId);
  };

  return (
    <div className="flex w-full items-center gap-3 px-3 py-2 sm:px-4">
      <span className="w-9 text-right text-[10px] font-medium tabular-nums text-gray-600 sm:text-xs">
        {percentage}%
      </span>
      <div
        ref={trackRef}
        role="slider"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        aria-valuetext={`${percentage} percent${chapterLabel ? `, ${chapterLabel}` : ''}`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            const next = Math.max(0, fraction - 0.02);
            void goTo(String(next));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const next = Math.min(1, fraction + 0.02);
            void goTo(String(next));
          } else if (e.key === 'Home') {
            e.preventDefault();
            void goTo('0');
          } else if (e.key === 'End') {
            e.preventDefault();
            void goTo('1');
          }
        }}
        className="group relative h-2 flex-1 cursor-pointer touch-none select-none rounded-full bg-black/10"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-[width] duration-75"
          style={{ width: `${percentage}%` }}
        />
        <div
          className={cn(
            'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-black/10',
            dragging ? 'scale-125' : 'scale-100',
            'transition-transform',
          )}
          style={{ left: `${percentage}%` }}
        />
      </div>
      <SyncIndicator lastSavedAt={lastSavedAt} syncState={syncState} />
      <div className="hidden min-w-0 max-w-[40%] truncate text-right text-[10px] text-gray-500 sm:block sm:text-xs">
        {chapterLabel ?? bookTitle ?? ''}
      </div>
    </div>
  );
}

function SyncIndicator({
  lastSavedAt,
  syncState,
}: {
  lastSavedAt: string | null;
  syncState: 'idle' | 'saving' | 'offline' | 'error';
}) {
  // Tiny inline status dot + tooltip text.
  const label = (() => {
    if (syncState === 'saving') return 'Saving…';
    if (syncState === 'offline') return 'Offline — queued';
    if (syncState === 'error') return 'Save failed';
    if (lastSavedAt) {
      const d = new Date(lastSavedAt);
      return `Saved ${d.toLocaleTimeString()}`;
    }
    return 'Ready';
  })();
  const color = (() => {
    if (syncState === 'saving') return 'bg-amber-400';
    if (syncState === 'offline') return 'bg-gray-400';
    if (syncState === 'error') return 'bg-red-500';
    return 'bg-emerald-500';
  })();
  return (
    <span
      title={label}
      aria-label={label}
      className="flex shrink-0 items-center gap-1 text-[10px] text-gray-500 sm:text-xs"
    >
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          color,
          syncState === 'saving' && 'animate-pulse',
        )}
      />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
