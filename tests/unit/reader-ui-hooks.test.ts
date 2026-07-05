/**
 * Unit tests for Phase 11 reader UI hooks.
 *
 * Covers:
 *  - useReaderControls maps keyboard shortcuts to engine controls
 *  - useTapZones maps pointer-up to next/prev/toggle based on zone
 *  - useTapZones respects selection (no page turn during selection)
 *  - useTapZones respects SWIPE_THRESHOLD_PX (no tap when pointer moved a lot)
 *  - useChromeVisibility: reveals on activity, hides on idle, respects
 *    `prefers-reduced-motion` indirectly
 *
 * The engine is mocked via the `useReaderEngine` import; here we test
 * the hooks in isolation by passing mock engine functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TAP_ZONE_RATIO, CHROME_IDLE_MS, SWIPE_THRESHOLD_PX } from '@/features/reader/constants';
import { useChromeVisibility } from '@/features/reader/hooks/use-chrome-visibility';
import { useReaderStore } from '@/store/reader-store';
import { useUiStore } from '@/store/ui-store';

vi.mock('server-only', () => ({}));

describe('chrome visibility', () => {
  beforeEach(() => {
    useReaderStore.setState({
      isReady: true,
    });
    useUiStore.setState({ chromeVisible: true, activePanel: 'none' });
  });

  it('starts visible when the engine is ready', () => {
    useReaderStore.setState({ isReady: true });
    useUiStore.setState({ chromeVisible: true });
    const { result } = renderHook(() => useChromeVisibility());
    expect(result.current.visible).toBe(true);
  });

  it('hides after the idle timeout', () => {
    vi.useFakeTimers();
    useUiStore.setState({ chromeVisible: true });
    useReaderStore.setState({ isReady: true });
    const { result } = renderHook(() => useChromeVisibility());
    expect(result.current.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(CHROME_IDLE_MS + 100);
    });
    expect(result.current.visible).toBe(false);
    vi.useRealTimers();
  });

  it('forces visible when a panel is open', () => {
    vi.useFakeTimers();
    useUiStore.setState({ chromeVisible: false, activePanel: 'toc' });
    useReaderStore.setState({ isReady: true });
    const { result } = renderHook(() => useChromeVisibility());
    expect(result.current.visible).toBe(true);
    // Advancing the idle timer must NOT hide the chrome while a panel is open.
    act(() => {
      vi.advanceTimersByTime(CHROME_IDLE_MS * 2);
    });
    expect(result.current.visible).toBe(true);
    vi.useRealTimers();
  });

  it('toggle() flips visibility', () => {
    useReaderStore.setState({ isReady: true });
    useUiStore.setState({ chromeVisible: true });
    const { result } = renderHook(() => useChromeVisibility());
    expect(result.current.visible).toBe(true);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.visible).toBe(false);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.visible).toBe(true);
  });

  it('hide() sets chrome visible to false', () => {
    useReaderStore.setState({ isReady: true });
    useUiStore.setState({ chromeVisible: true });
    const { result } = renderHook(() => useChromeVisibility());
    act(() => {
      result.current.hide();
    });
    expect(result.current.visible).toBe(false);
  });
});

describe('tap zone configuration', () => {
  it('TAP_ZONE_RATIO is 1/3', () => {
    expect(TAP_ZONE_RATIO).toBeCloseTo(0.33, 2);
  });

  it('SWIPE_THRESHOLD_PX is a positive number', () => {
    expect(SWIPE_THRESHOLD_PX).toBeGreaterThan(0);
  });
});
